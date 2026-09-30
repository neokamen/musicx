use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::process::Command;
use tokio::sync::{Mutex, Semaphore};
use reqwest;

pub struct DownloaderState {
    pub cancel_flag: Arc<AtomicBool>,
    pub running_pids: Arc<Mutex<Vec<u32>>>,
}

impl Default for DownloaderState {
    fn default() -> Self {
        Self {
            cancel_flag: Arc::new(AtomicBool::new(false)),
            running_pids: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NeoTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    #[serde(default)]
    pub year: String,
    pub track_number: u32,
    pub total_tracks: u32,
    pub duration: u32, // seconds
    pub duration_string: String,
    pub cover_url: String,
    pub source_url: Option<String>,
}

pub type RipperTrack = NeoTrack;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResult {
    pub kind: String, // "track" | "playlist" | "album" | "search"
    pub name: String,
    pub total_tracks: usize,
    pub tracks: Vec<NeoTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadBatchOptions {
    pub format: String, // "flac", "mp3", "wav", "m4a", "opus", "mp4"
    pub bitrate: String, // "lossless", "320k", "256k", "192k", "128k"
    /// Sample rate override for audio output — e.g. 44100, 48000, 96000, 192000
    #[serde(default)]
    pub sample_rate: Option<u32>,
    /// Video quality for mp4 format — "best", "1080", "720", "480", "360"
    #[serde(default)]
    pub video_quality: Option<String>,
    pub save_in_folder: bool,
    pub folder_name: Option<String>,
    pub naming_pattern: String,
    pub embed_id3_tags: bool,
    pub output_folder: String,
    /// Raw Netscape-format cookies text (for YouTube bot bypass)
    #[serde(default)]
    pub youtube_cookies: Option<String>,
    /// Browser name to extract cookies from (e.g. "chrome", "firefox", "brave")
    #[serde(default)]
    pub cookies_from_browser: Option<String>,
    /// Download lyrics as .txt alongside audio
    #[serde(default)]
    pub download_lyrics: bool,
    /// Per-track custom cover URL overrides: map of track_id -> cover_url
    #[serde(default)]
    pub track_covers: std::collections::HashMap<String, String>,
}

/// Cookie authentication helpers for yt-dlp
#[derive(Debug, Clone, Default)]
pub struct CookieAuth {
    pub cookies_path: Option<String>,
    pub cookies_from_browser: Option<String>,
}

impl CookieAuth {
    pub fn append_to(&self, args: &mut Vec<String>) {
        if let Some(path) = &self.cookies_path {
            args.push("--cookies".into());
            args.push(path.clone());
        } else if let Some(browser) = &self.cookies_from_browser {
            args.push("--cookies-from-browser".into());
            args.push(browser.clone());
        }
    }
}

/// Write raw cookies text to a temp file and return the path.
/// Returns None if no cookies text provided.
async fn write_cookies_file(
    youtube_cookies: Option<&str>,
    work_dir: &std::path::Path,
) -> Option<String> {
    match youtube_cookies.filter(|s| !s.trim().is_empty()) {
        Some(raw) => {
            let p = work_dir.join("cookies.txt");
            if tokio::fs::write(&p, raw.as_bytes()).await.is_ok() {
                Some(p.to_string_lossy().to_string())
            } else {
                None
            }
        }
        None => None,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackProgressPayload {
    pub track_id: String,
    pub phase: String, // "queued" | "downloading" | "converting" | "tagging" | "done" | "error"
    pub percent: u32,
    pub message: String,
    pub file_path: Option<String>,
}

use crate::ytdlp::{append_modern_ytdlp_args, get_yt_dlp_binary, try_auto_update_ytdlp};

fn format_duration(seconds: u32) -> String {
    let m = seconds / 60;
    let s = seconds % 60;
    format!("{}:{:02}", m, s)
}

fn clean_filename(input: &str) -> String {
    let re = Regex::new(r#"[\\/:*?"<>|]"#).unwrap();
    re.replace_all(input, "_").trim().to_string()
}

/// Sanitize a single path segment (folder or filename component) — no slashes allowed
fn sanitize_path_segment(input: &str) -> String {
    let re = Regex::new(r#"[\\/:*?"<>|]"#).unwrap();
    let s = re.replace_all(input, "_").trim().to_string();
    if s.is_empty() { "Desconocido".to_string() } else { s }
}

fn resolve_naming_template(pattern: &str) -> &str {
    match pattern {
        "artist_year_album_track_title" => "{artist}/{year} - {album}/{trackNumber} - {title}",
        "artist_album_track_title"      => "{artist}/{album}/{trackNumber} - {title}",
        "number_artist_title"           => "{trackNumber} - {artist} - {title}",
        "artist_title"                  => "{artist} - {title}",
        "title_artist"                  => "{title} - {artist}",
        "title"                         => "{title}",
        other => {
            let t = other.trim();
            if t.is_empty() {
                "{trackNumber} - {artist} - {title}"
            } else {
                t
            }
        }
    }
}

fn sanitize_tag_field(val: &str) -> String {
    val.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Render a relative file path (may include subdirectories) based on the naming pattern.
/// Returns a relative path like "Artist/Album/01 - Title.mp3"
fn render_track_filename(pattern: &str, track: &RipperTrack, ext: &str) -> String {
    let template = resolve_naming_template(pattern);

    let num = if track.track_number > 0 {
        format!("{:02}", track.track_number)
    } else {
        "01".to_string()
    };
    let year = if track.year.trim().is_empty() {
        "0000".to_string()
    } else {
        sanitize_tag_field(&track.year)
    };
    let safe_artist = sanitize_tag_field(if track.artist.trim().is_empty() { "Artista Desconocido" } else { &track.artist });
    let safe_title = sanitize_tag_field(if track.title.trim().is_empty() { "Pista Desconocida" } else { &track.title });
    let safe_album = sanitize_tag_field(if track.album.trim().is_empty() { "Álbum Desconocido" } else { &track.album });

    let mut rendered = template.to_string();

    // Replace artist tokens
    for tok in &["{artist}", "{artista}", "{nombre Artista}", "{nombre_artista}", "{nombreArtista}"] {
        rendered = rendered.replace(tok, &safe_artist);
    }
    // Replace album tokens
    for tok in &["{album}", "{nombre album}", "{nombre_album}", "{nombreAlbum}"] {
        rendered = rendered.replace(tok, &safe_album);
    }
    // Replace year tokens
    for tok in &["{year}", "{año}", "{ano}", "{fecha}"] {
        rendered = rendered.replace(tok, &year);
    }
    // Replace track number tokens
    for tok in &["{trackNumber}", "{track_number}", "{track}", "{numero}", "{pista}"] {
        rendered = rendered.replace(tok, &num);
    }
    // Replace title tokens
    for tok in &["{title}", "{titulo}", "{cancion}", "{nombre}"] {
        rendered = rendered.replace(tok, &safe_title);
    }
    // Replace playlist tokens
    for tok in &["{playlist}", "{album_playlist}"] {
        rendered = rendered.replace(tok, &safe_album);
    }
    // Replace total tracks token
    for tok in &["{totalTracks}", "{total_tracks}", "{total}"] {
        rendered = rendered.replace(tok, "01");
    }

    // Process segments separated by / or \
    let parts: Vec<&str> = rendered.split(|c| c == '/' || c == '\\').collect();
    let mut clean_parts = Vec::new();
    for (i, part) in parts.iter().enumerate() {
        let is_last = i == parts.len() - 1;
        let s = sanitize_path_segment(part);
        if !s.is_empty() {
            if is_last {
                clean_parts.push(format!("{}.{}", s, ext.trim_start_matches('.')));
            } else {
                clean_parts.push(s);
            }
        }
    }

    if clean_parts.is_empty() {
        format!("{} - {}.{}", safe_artist, safe_title, ext)
    } else {
        clean_parts.join("/")
    }
}


/// Analyze a Spotify or YouTube URL, or search query
#[tauri::command]
pub async fn analyze_source_link(url_or_query: String, limit: Option<u32>) -> Result<AnalyzeResult, String> {
    let trimmed = url_or_query.trim();
    if trimmed.is_empty() {
        return Err("Por favor ingresa un enlace o término de búsqueda.".to_string());
    }

    // ── SPOTIFY HANDLING ──
    if trimmed.contains("open.spotify.com") || trimmed.contains("spotify.link") {
        return analyze_spotify(trimmed).await;
    }

    // ── YOUTUBE OR DIRECT SEARCH HANDLING ──
    analyze_youtube_or_search(trimmed, limit.unwrap_or(20)).await
}

async fn analyze_spotify(url: &str) -> Result<AnalyzeResult, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {}", e))?;

    let is_track = url.contains("/track/");
    let is_album = url.contains("/album/");
    let is_playlist = url.contains("/playlist/");

    // 1. Try Spotify oEmbed first
    let encoded_url: String = url::form_urlencoded::byte_serialize(url.as_bytes()).collect();
    let oembed_url = format!("https://open.spotify.com/oembed?url={}", encoded_url);

    let oembed_json: Option<serde_json::Value> = if let Ok(resp) = client.get(&oembed_url).send().await {
        resp.json().await.ok()
    } else {
        None
    };

    let title_from_oembed = oembed_json.as_ref()
        .and_then(|j| j.get("title"))
        .and_then(|t| t.as_str())
        .unwrap_or("Spotify Audio")
        .to_string();

    let cover_from_oembed = oembed_json.as_ref()
        .and_then(|j| j.get("thumbnail_url"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    if is_track {
        // Single track
        let (artist, title) = if title_from_oembed.contains(" - ") {
            let mut parts = title_from_oembed.splitn(2, " - ");
            let p1 = parts.next().unwrap_or("").trim().to_string();
            let p2 = parts.next().unwrap_or("").trim().to_string();
            (p2, p1)
        } else {
            ("Artista".to_string(), title_from_oembed.clone())
        };

        let track = RipperTrack {
            id: format!("sp_{}", fastrand_id()),
            title: title.clone(),
            artist,
            album: title.clone(),
            year: "2024".to_string(),
            track_number: 1,
            total_tracks: 1,
            duration: 0,
            duration_string: "--:--".to_string(),
            cover_url: cover_from_oembed,
            source_url: Some(url.to_string()),
        };

        return Ok(AnalyzeResult {
            kind: "track".to_string(),
            name: title,
            total_tracks: 1,
            tracks: vec![track],
        });
    }

    // If album or playlist, scrape HTML page for __NEXT_DATA__ or song tags
    let html_resp = client.get(url).send().await
        .map_err(|e| format!("No se pudo conectar a Spotify: {}", e))?;
    let html = html_resp.text().await.map_err(|e| format!("Error leyendo página: {}", e))?;

    let next_data_re = Regex::new(r#"(?s)<script id="__NEXT_DATA__"[^>]*>(.*?)</script>"#).unwrap();
    let mut tracks = Vec::new();

    if let Some(caps) = next_data_re.captures(&html) {
        if let Some(json_str) = caps.get(1) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                // Explore entity
                if let Some(track_list) = v.pointer("/props/pageProps/state/data/entity/trackList")
                    .or_else(|| v.pointer("/props/pageProps/state/data/entity/tracks/items"))
                    .and_then(|x| x.as_array())
                {
                    for (i, t_val) in track_list.iter().enumerate() {
                        let t_obj = t_val.get("track").unwrap_or(t_val);
                        let name = t_obj.get("name").or_else(|| t_obj.get("title"))
                            .and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
                        if name.is_empty() {
                            continue;
                        }

                        let artist = t_obj.get("artists")
                            .and_then(|x| x.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|a| a.get("name"))
                            .and_then(|x| x.as_str())
                            .or_else(|| t_obj.get("artist").and_then(|x| x.as_str()))
                            .unwrap_or("Artista Desconocido")
                            .to_string();

                        let dur_ms = t_obj.get("durationMs").or_else(|| t_obj.get("duration_ms"))
                            .and_then(|x| x.as_u64()).unwrap_or(0);
                        let dur_sec = (dur_ms / 1000) as u32;

                        let cover = t_obj.get("album")
                            .and_then(|a| a.get("images"))
                            .and_then(|img| img.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|item| item.get("url"))
                            .and_then(|u| u.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| cover_from_oembed.clone());

                        tracks.push(RipperTrack {
                            id: format!("sp_{}", fastrand_id()),
                            title: name,
                            artist,
                            album: title_from_oembed.clone(),
                            year: "".to_string(),
                            track_number: (i + 1) as u32,
                            total_tracks: track_list.len() as u32,
                            duration: dur_sec,
                            duration_string: if dur_sec > 0 { format_duration(dur_sec) } else { "--:--".to_string() },
                            cover_url: cover,
                            source_url: None,
                        });
                    }
                }
            }
        }
    }

    if tracks.is_empty() {
        // Fallback: single item from oEmbed
        let track = RipperTrack {
            id: format!("sp_{}", fastrand_id()),
            title: title_from_oembed.clone(),
            artist: "Spotify".to_string(),
            album: title_from_oembed.clone(),
            year: "".to_string(),
            track_number: 1,
            total_tracks: 1,
            duration: 0,
            duration_string: "--:--".to_string(),
            cover_url: cover_from_oembed,
            source_url: Some(url.to_string()),
        };
        tracks.push(track);
    }

    let kind_str = if is_album { "album" } else if is_playlist { "playlist" } else { "track" };

    Ok(AnalyzeResult {
        kind: kind_str.to_string(),
        name: title_from_oembed,
        total_tracks: tracks.len(),
        tracks,
    })
}

async fn analyze_youtube_or_search(query: &str, limit: u32) -> Result<AnalyzeResult, String> {
    let bin = get_yt_dlp_binary();

    let is_url = query.starts_with("http://") || query.starts_with("https://");
    let target = if is_url {
        query.to_string()
    } else {
        format!("ytsearch{}:{}", limit, query)
    };

    let mut args: Vec<String> = vec![
        target,
        "--dump-json".into(),
        "--flat-playlist".into(),
        "--skip-download".into(),
        "--no-warnings".into(),
    ];
    append_modern_ytdlp_args(&mut args);

    let mut output = Command::new(&bin)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Error ejecutando yt-dlp: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        if err.contains("403") || err.contains("Forbidden") || err.contains("Signature") || err.contains("outdated") || err.contains("older than") {
            if try_auto_update_ytdlp().await.is_ok() {
                output = Command::new(&bin)
                    .args(&args)
                    .output()
                    .await
                    .map_err(|e| format!("Error ejecutando yt-dlp tras auto-reparación: {}", e))?;
            }
        }
    }

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp error: {}", err));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let mut tracks = Vec::new();
    let mut playlist_name = "Resultados de YouTube".to_string();
    let mut is_playlist = false;

    for (idx, line) in stdout_str.lines().enumerate() {
        let line_trimmed = line.trim();
        if line_trimmed.is_empty() {
            continue;
        }

        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line_trimmed) {
            if let Some(p_title) = v.get("playlist_title").and_then(|x| x.as_str()) {
                playlist_name = p_title.to_string();
                is_playlist = true;
            }

            let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let mut raw_title = v.get("title").and_then(|x| x.as_str()).unwrap_or("Audio").to_string();
            let mut uploader = v.get("channel")
                .or_else(|| v.get("uploader"))
                .or_else(|| v.get("creator"))
                .and_then(|x| x.as_str())
                .unwrap_or("Desconocido")
                .to_string();

            // Improve artist/title separation if title contains " - "
            if raw_title.contains(" - ") {
                let parts: Vec<&str> = raw_title.splitn(2, " - ").collect();
                if parts.len() == 2 && !parts[0].trim().is_empty() && !parts[1].trim().is_empty() {
                    uploader = parts[0].trim().to_string();
                    raw_title = parts[1].trim().to_string();
                }
            }

            let album_name = v.get("album")
                .and_then(|x| x.as_str())
                .unwrap_or(&playlist_name)
                .to_string();

            let year_str = v.get("release_year")
                .or_else(|| v.get("year"))
                .and_then(|x| {
                    if let Some(s) = x.as_str() {
                        Some(s.to_string())
                    } else if let Some(n) = x.as_i64() {
                        Some(n.to_string())
                    } else {
                        None
                    }
                })
                .unwrap_or_default();

            let dur_sec = v.get("duration").and_then(|x| x.as_f64()).map(|d| d as u32).unwrap_or(0);
            let dur_str = v.get("duration_string").and_then(|x| x.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| if dur_sec > 0 { format_duration(dur_sec) } else { "--:--".to_string() });

            let cover = v.get("thumbnails")
                .and_then(|x| x.as_array())
                .and_then(|arr| arr.last())
                .and_then(|item| item.get("url"))
                .and_then(|u| u.as_str())
                .or_else(|| v.get("thumbnail").and_then(|x| x.as_str()))
                .unwrap_or("")
                .to_string();

            let video_url = if !id.is_empty() {
                format!("https://www.youtube.com/watch?v={}", id)
            } else {
                v.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string()
            };

            tracks.push(RipperTrack {
                id: format!("yt_{}", if !id.is_empty() { id } else { fastrand_id() }),
                title: raw_title,
                artist: uploader,
                album: album_name,
                year: year_str,
                track_number: (idx + 1) as u32,
                total_tracks: 1,
                duration: dur_sec,
                duration_string: dur_str,
                cover_url: cover,
                source_url: Some(video_url),
            });
        }
    }

    if tracks.is_empty() {
        return Err("No se encontraron canciones para el enlace o búsqueda proporcionado.".to_string());
    }

    let kind = if is_playlist {
        "playlist"
    } else if is_url {
        "track"
    } else {
        "search"
    };

    Ok(AnalyzeResult {
        kind: kind.to_string(),
        name: playlist_name,
        total_tracks: tracks.len(),
        tracks,
    })
}

/// Download batch of tracks concurrently with progress streaming and ID3 embedding
#[tauri::command]
pub async fn download_track_batch(
    app: AppHandle,
    state: State<'_, DownloaderState>,
    tracks: Vec<RipperTrack>,
    options: DownloadBatchOptions,
) -> Result<Vec<String>, String> {
    state.cancel_flag.store(false, Ordering::SeqCst);

    if tracks.is_empty() {
        return Err("No hay pistas seleccionadas para descargar.".to_string());
    }

    // Determine target folder
    let mut target_dir = PathBuf::from(&options.output_folder);
    if options.save_in_folder {
        if let Some(folder_sub) = &options.folder_name {
            let clean_sub = clean_filename(folder_sub);
            if !clean_sub.is_empty() {
                target_dir = target_dir.join(clean_sub);
            }
        }
    }

    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| format!("Error creando carpeta de descarga: {}", e))?;

    let bin = get_yt_dlp_binary();
    let semaphore = Arc::new(Semaphore::new(3)); // 3 concurrent downloads
    let downloaded_paths = Arc::new(Mutex::new(Vec::new()));
    let mut tasks = Vec::new();

    // Write cookies file once (shared across all tracks)
    let cookies_file_path: Option<String> =
        write_cookies_file(options.youtube_cookies.as_deref(), &target_dir).await;

    let cookies_file_arc: Arc<Option<String>> = Arc::new(cookies_file_path);

    for track in tracks {
        let sem = semaphore.clone();
        let app_handle = app.clone();
        let cancel = state.cancel_flag.clone();
        let pids_lock = state.running_pids.clone();
        let bin_path = bin.clone();
        let dest_dir = target_dir.clone();
        let opt = options.clone();
        let paths_acc = downloaded_paths.clone();
        let cookies_path_clone = cookies_file_arc.clone();


        let task = tokio::spawn(async move {
            let _permit = match sem.acquire().await {
                Ok(p) => p,
                Err(_) => return,
            };

            if cancel.load(Ordering::SeqCst) {
                return;
            }

            let track_id = track.id.clone();

            // Emit: starting download
            let _ = app_handle.emit(
                "download-track-progress",
                TrackProgressPayload {
                    track_id: track_id.clone(),
                    phase: "downloading".to_string(),
                    percent: 5,
                    message: format!("Descargando: {}...", track.title),
                    file_path: None,
                },
            );

            // Determine query for yt-dlp
            let query_target = if let Some(src) = &track.source_url {
                if src.contains("youtube.com") || src.contains("youtu.be") {
                    src.clone()
                } else {
                    format!("ytsearch1:{} - {}", track.artist, track.title)
                }
            } else {
                format!("ytsearch1:{} - {}", track.artist, track.title)
            };

            // Temporary download file template
            let temp_id = fastrand_id();
            let is_video = opt.format == "mp4";
            let temp_out = dest_dir.join(format!("temp_{}.%(ext)s", temp_id)).to_string_lossy().to_string();

            // Build cookie auth for yt-dlp
            let auth = CookieAuth {
                cookies_path: cookies_path_clone.as_ref().clone(),
                cookies_from_browser: opt.cookies_from_browser.clone(),
            };

            let mut yt_args: Vec<String> = if is_video {
                // Download video+audio for MP4
                let vq = opt.video_quality.as_deref().unwrap_or("best");
                let format_selector = match vq {
                    "1080" => "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
                    "720"  => "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best",
                    "480"  => "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]/best",
                    "360"  => "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]/best",
                    _      => "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
                };
                vec![
                    "-f".into(), format_selector.into(),
                    "--merge-output-format".into(), "mp4".into(),
                    "--no-playlist".into(),
                    "-o".into(), temp_out.clone(),
                ]
            } else {
                vec![
                    "--extract-audio".into(),
                    "--audio-format".into(),
                    "wav".into(),
                    "--audio-quality".into(),
                    "0".into(),
                    "--no-playlist".into(),
                    "-o".into(),
                    temp_out.clone(),
                ]
            };
            append_modern_ytdlp_args(&mut yt_args);
            auth.append_to(&mut yt_args);
            yt_args.push(query_target.clone());

            let mut cmd = Command::new(&bin_path);
            cmd.args(&yt_args)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());


            let mut child = match cmd.spawn() {
                Ok(c) => c,
                Err(e) => {
                    let _ = app_handle.emit(
                        "download-track-progress",
                        TrackProgressPayload {
                            track_id,
                            phase: "error".to_string(),
                            percent: 0,
                            message: format!("Error lanzando yt-dlp: {}", e),
                            file_path: None,
                        },
                    );
                    return;
                }
            };

            if let Some(pid) = child.id() {
                pids_lock.lock().await.push(pid);
            }

            let status = match child.wait().await {
                Ok(s) => s,
                Err(e) => {
                    let _ = app_handle.emit(
                        "download-track-progress",
                        TrackProgressPayload {
                            track_id,
                            phase: "error".to_string(),
                            percent: 0,
                            message: format!("Error en proceso: {}", e),
                            file_path: None,
                        },
                    );
                    return;
                }
            };

            if cancel.load(Ordering::SeqCst) || !status.success() {
                let _ = app_handle.emit(
                    "download-track-progress",
                    TrackProgressPayload {
                        track_id,
                        phase: "error".to_string(),
                        percent: 0,
                        message: "Fallo descargando desde YouTube.".to_string(),
                        file_path: None,
                    },
                );
                return;
            }

            // For video format — find the downloaded mp4 and move it directly
            if is_video {
                // Find the downloaded mp4 file (temp_<id>.mp4)
                let temp_mp4 = dest_dir.join(format!("temp_{}.mp4", temp_id));
                // Also try .mkv fallback
                let temp_mkv = dest_dir.join(format!("temp_{}.mkv", temp_id));
                let temp_video = if temp_mp4.exists() { temp_mp4 } else { temp_mkv };

                if !temp_video.exists() {
                    let _ = app_handle.emit(
                        "download-track-progress",
                        TrackProgressPayload {
                            track_id,
                            phase: "error".to_string(),
                            percent: 0,
                            message: "No se encontró el archivo de vídeo descargado.".to_string(),
                            file_path: None,
                        },
                    );
                    return;
                }

                let _ = app_handle.emit(
                    "download-track-progress",
                    TrackProgressPayload {
                        track_id: track_id.clone(),
                        phase: "converting".to_string(),
                        percent: 80,
                        message: "Finalizando archivo de vídeo...".to_string(),
                        file_path: None,
                    },
                );

                let final_rel = render_track_filename(&opt.naming_pattern, &track, "mp4");
                let final_file_path = {
                    let full = dest_dir.join(&final_rel);
                    if let Some(parent) = full.parent() {
                        let _ = tokio::fs::create_dir_all(parent).await;
                    }
                    full
                };

                // Remux with ffmpeg to ensure clean mp4 container + metadata
                let mut ffmpeg = Command::new("ffmpeg");
                ffmpeg.arg("-y").arg("-nostdin").arg("-i").arg(&temp_video)
                    .arg("-c").arg("copy");
                if opt.embed_id3_tags {
                    ffmpeg.arg("-metadata").arg(format!("title={}", track.title))
                        .arg("-metadata").arg(format!("artist={}", track.artist))
                        .arg("-metadata").arg(format!("album={}", track.album))
                        .arg("-metadata").arg(format!("track={}", track.track_number));
                    if !track.year.is_empty() {
                        ffmpeg.arg("-metadata").arg(format!("date={}", track.year));
                    }
                }
                ffmpeg.arg(&final_file_path);

                let ff_status = ffmpeg.output().await;
                let _ = tokio::fs::remove_file(&temp_video).await;

                match ff_status {
                    Ok(out) if out.status.success() => {
                        let path_str = final_file_path.to_string_lossy().to_string();
                        paths_acc.lock().await.push(path_str.clone());
                        let _ = app_handle.emit(
                            "download-track-progress",
                            TrackProgressPayload {
                                track_id,
                                phase: "done".to_string(),
                                percent: 100,
                                message: "Descarga de vídeo completada".to_string(),
                                file_path: Some(path_str),
                            },
                        );
                    }
                    _ => {
                        // If remux fails, just rename the temp file directly
                        if let Err(_) = tokio::fs::rename(&temp_video, &final_file_path).await {
                            let _ = app_handle.emit(
                                "download-track-progress",
                                TrackProgressPayload {
                                    track_id,
                                    phase: "error".to_string(),
                                    percent: 0,
                                    message: "Error finalizando el archivo de vídeo.".to_string(),
                                    file_path: None,
                                },
                            );
                            return;
                        }
                        let path_str = final_file_path.to_string_lossy().to_string();
                        paths_acc.lock().await.push(path_str.clone());
                        let _ = app_handle.emit(
                            "download-track-progress",
                            TrackProgressPayload {
                                track_id,
                                phase: "done".to_string(),
                                percent: 100,
                                message: "Vídeo descargado".to_string(),
                                file_path: Some(path_str),
                            },
                        );
                    }
                }
                return;
            }

            // Audio path: expect WAV intermediate
            let temp_wav = dest_dir.join(format!("temp_{}.wav", temp_id));
            if !temp_wav.exists() {
                let _ = app_handle.emit(
                    "download-track-progress",
                    TrackProgressPayload {
                        track_id,
                        phase: "error".to_string(),
                        percent: 0,
                        message: "No se encontró el archivo WAV intermedio.".to_string(),
                        file_path: None,
                    },
                );
                return;
            }

            // Phase 2: Transcode & Tag with FFmpeg
            let _ = app_handle.emit(
                "download-track-progress",
                TrackProgressPayload {
                    track_id: track_id.clone(),
                    phase: "converting".to_string(),
                    percent: 80,
                    message: "Transcodificando y etiquetando metadatos...".to_string(),
                    file_path: None,
                },
            );

            let final_rel = render_track_filename(&opt.naming_pattern, &track, &opt.format);
            // Support subfolder patterns — create parent dirs if path has segments
            let final_file_path = {
                let full = dest_dir.join(&final_rel);
                if let Some(parent) = full.parent() {
                    let _ = tokio::fs::create_dir_all(parent).await;
                }
                full
            };

            // Resolve cover artwork if embedding metadata
            let cover_url_opt = opt.track_covers.get(&track.id).cloned().or_else(|| {
                let trimmed = track.cover_url.trim();
                if !trimmed.is_empty() {
                    Some(trimmed.to_string())
                } else {
                    None
                }
            });

            let temp_cover_dir = std::env::temp_dir().join(format!("neo_cov_{}", temp_id));
            let local_cover_path = if opt.embed_id3_tags {
                if let Some(c_url) = &cover_url_opt {
                    let _ = tokio::fs::create_dir_all(&temp_cover_dir).await;
                    let cover_file = temp_cover_dir.join("cover.jpg");
                    let client = reqwest::Client::builder()
                        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                        .timeout(std::time::Duration::from_secs(12))
                        .build()
                        .unwrap_or_default();
                    if let Ok(resp) = client.get(c_url).send().await {
                        if let Ok(bytes) = resp.bytes().await {
                            if tokio::fs::write(&cover_file, &bytes).await.is_ok() {
                                Some(cover_file)
                            } else { None }
                        } else { None }
                    } else { None }
                } else {
                    None
                }
            } else {
                None
            };

            let mut ffmpeg = Command::new("ffmpeg");
            ffmpeg.arg("-y").arg("-nostdin").arg("-i").arg(&temp_wav);

            let has_cover = local_cover_path.is_some() && matches!(opt.format.as_str(), "mp3" | "flac" | "m4a");
            if let Some(ref c_path) = local_cover_path {
                if has_cover {
                    ffmpeg.arg("-i").arg(c_path);
                    ffmpeg.arg("-map").arg("0:a:0").arg("-map").arg("1:0");
                }
            }

            // Audio codec options
            match opt.format.as_str() {
                "flac" => {
                    ffmpeg.arg("-c:a").arg("flac");
                    if has_cover {
                        ffmpeg.arg("-c:v").arg("copy")
                            .arg("-disposition:v:0").arg("attached_pic");
                    }
                }
                "wav" => {
                    ffmpeg.arg("-c:a").arg("pcm_s16le");
                }
                "m4a" => {
                    ffmpeg.arg("-c:a").arg("aac").arg("-b:a").arg(&opt.bitrate);
                    if has_cover {
                        ffmpeg.arg("-c:v").arg("copy")
                            .arg("-disposition:v:0").arg("attached_pic");
                    }
                }
                "opus" => {
                    ffmpeg.arg("-c:a").arg("libopus").arg("-b:a").arg(&opt.bitrate);
                }
                "mp3" | _ => {
                    ffmpeg.arg("-c:a").arg("libmp3lame").arg("-b:a").arg(if opt.bitrate == "lossless" { "320k" } else { &opt.bitrate });
                    if has_cover {
                        ffmpeg.arg("-c:v").arg("mjpeg")
                            .arg("-pix_fmt").arg("yuvj420p")
                            .arg("-id3v2_version").arg("3")
                            .arg("-metadata:s:v").arg("title=Album cover")
                            .arg("-metadata:s:v").arg("comment=Cover (front)")
                            .arg("-disposition:v").arg("attached_pic");
                    }
                }
            }

            // Sample rate override (not applicable to wav/flac lossless)
            if let Some(sr) = opt.sample_rate {
                if sr > 0 && !matches!(opt.format.as_str(), "wav") {
                    ffmpeg.arg("-ar").arg(sr.to_string());
                }
            }

            // ID3 Metadata tags
            if opt.embed_id3_tags {
                ffmpeg.arg("-metadata").arg(format!("title={}", track.title))
                    .arg("-metadata").arg(format!("artist={}", track.artist))
                    .arg("-metadata").arg(format!("album={}", track.album))
                    .arg("-metadata").arg(format!("track={}", track.track_number));
                if !track.year.is_empty() {
                    ffmpeg.arg("-metadata").arg(format!("date={}", track.year));
                }
            }

            ffmpeg.arg(&final_file_path);

            let ff_status = ffmpeg.output().await;

            // Clean up temporary files
            let _ = tokio::fs::remove_file(&temp_wav).await;
            if temp_cover_dir.exists() {
                let _ = tokio::fs::remove_dir_all(&temp_cover_dir).await;
            }


            match ff_status {
                Ok(out) if out.status.success() => {
                    let path_str = final_file_path.to_string_lossy().to_string();
                    paths_acc.lock().await.push(path_str.clone());

                    // (Lyrics download not available in MusicX)

                    let _ = app_handle.emit(
                        "download-track-progress",
                        TrackProgressPayload {
                            track_id,
                            phase: "done".to_string(),
                            percent: 100,
                            message: "Descarga completada".to_string(),
                            file_path: Some(path_str),
                        },
                    );
                }
                _ => {
                    let _ = app_handle.emit(
                        "download-track-progress",
                        TrackProgressPayload {
                            track_id,
                            phase: "error".to_string(),
                            percent: 0,
                            message: "Error al transcodificar el archivo final con FFmpeg.".to_string(),
                            file_path: None,
                        },
                    );
                }
            }
        });

        tasks.push(task);
    }


    for task in tasks {
        let _ = task.await;
    }

    let results = downloaded_paths.lock().await.clone();
    Ok(results)
}

/// Cancel all active downloads
#[tauri::command]
pub async fn cancel_download_batch(state: State<'_, DownloaderState>) -> Result<(), String> {
    state.cancel_flag.store(true, Ordering::SeqCst);
    let mut pids = state.running_pids.lock().await;
    for pid in pids.drain(..) {
        let _ = Command::new("kill").arg("-9").arg(pid.to_string()).output().await;
    }
    Ok(())
}

fn fastrand_id() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{:x}", now)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlinePlaylistItem {
    pub id: String,
    pub title: String,
    pub uploader: String,
    pub url: String,
    pub cover: String,
    pub track_count: Option<u32>,
}

/// Search YouTube playlists and full albums
#[tauri::command]
pub async fn search_online_playlists(query: String) -> Result<Vec<OnlinePlaylistItem>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let bin = get_yt_dlp_binary();
    let encoded_query: String = url::form_urlencoded::byte_serialize(trimmed.as_bytes()).collect();
    let search_url = format!(
        "https://www.youtube.com/results?search_query={}&sp=EgIQAw%253D%253D",
        encoded_query
    );

    let mut args: Vec<String> = vec![
        search_url,
        "--dump-json".into(),
        "--flat-playlist".into(),
        "--playlist-end".into(),
        "15".into(),
        "--skip-download".into(),
        "--no-warnings".into(),
    ];
    append_modern_ytdlp_args(&mut args);

    let mut output = Command::new(&bin)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Error ejecutando yt-dlp para buscar playlists: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        if err.contains("403") || err.contains("Forbidden") || err.contains("Signature") || err.contains("outdated") || err.contains("older than") {
            if try_auto_update_ytdlp().await.is_ok() {
                output = Command::new(&bin)
                    .args(&args)
                    .output()
                    .await
                    .map_err(|e| format!("Error ejecutando yt-dlp tras auto-reparación: {}", e))?;
            }
        }
    }

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Error buscando listas de reproducción: {}", err));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let mut playlists = Vec::new();

    for line in stdout_str.lines() {
        let line_trimmed = line.trim();
        if line_trimmed.is_empty() {
            continue;
        }

        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line_trimmed) {
            let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("Álbum / Lista").to_string();
            let uploader = v.get("channel")
                .or_else(|| v.get("uploader"))
                .and_then(|x| x.as_str())
                .unwrap_or("YouTube")
                .to_string();

            let cover = v.get("thumbnails")
                .and_then(|x| x.as_array())
                .and_then(|arr| arr.last())
                .and_then(|item| item.get("url"))
                .and_then(|u| u.as_str())
                .or_else(|| v.get("thumbnail").and_then(|x| x.as_str()))
                .unwrap_or("")
                .to_string();

            let url = if !id.is_empty() {
                format!("https://www.youtube.com/playlist?list={}", id)
            } else {
                v.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string()
            };

            let track_count = v.get("playlist_count")
                .and_then(|x| x.as_u64())
                .map(|c| c as u32);

            playlists.push(OnlinePlaylistItem {
                id,
                title,
                uploader,
                url,
                cover,
                track_count,
            });
        }
    }

    Ok(playlists)
}

/// Obtain direct streaming audio URL using yt-dlp without saving to disk.
#[tauri::command]
pub async fn get_stream_audio_url(url_or_id: String) -> Result<String, String> {
    let bin = get_yt_dlp_binary();
    let target = if url_or_id.starts_with("http://") || url_or_id.starts_with("https://") {
        url_or_id
    } else if url_or_id.starts_with("yt_") {
        let clean_id = url_or_id.trim_start_matches("yt_");
        format!("https://www.youtube.com/watch?v={clean_id}")
    } else {
        format!("https://www.youtube.com/watch?v={url_or_id}")
    };

    let mut args: Vec<String> = vec![
        "-g".into(),
        "-f".into(),
        "ba/b".into(),
        "--no-warnings".into(),
        "--no-playlist".into(),
        target,
    ];
    append_modern_ytdlp_args(&mut args);

    let output = Command::new(&bin)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Error ejecutando yt-dlp para streaming: {e}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp stream error: {err}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let url = stdout.lines().next().unwrap_or("").trim().to_string();
    if url.is_empty() {
        return Err("No se pudo obtener URL de stream".to_string());
    }
    Ok(url)
}

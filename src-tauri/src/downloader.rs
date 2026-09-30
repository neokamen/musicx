/// MusicX downloader — ported from Soundix NeoDownloader.
/// Provides analyze_source_link (YouTube search + Spotify) and download_track_batch (yt-dlp + ffmpeg).

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::process::Command;
use tokio::sync::{Mutex, Semaphore};

use crate::ytdlp::{append_modern_ytdlp_args, get_yt_dlp_binary, try_auto_update_ytdlp};

// ── State ────────────────────────────────────────────────────────────────────

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

// ── Shared types ─────────────────────────────────────────────────────────────

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
    pub duration: u32,
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
    pub format: String,
    pub bitrate: String,
    #[serde(default)]
    pub sample_rate: Option<u32>,
    #[serde(default)]
    pub video_quality: Option<String>,
    pub save_in_folder: bool,
    pub folder_name: Option<String>,
    pub naming_pattern: String,
    pub embed_id3_tags: bool,
    pub output_folder: String,
    #[serde(default)]
    pub youtube_cookies: Option<String>,
    #[serde(default)]
    pub cookies_from_browser: Option<String>,
    #[serde(default)]
    pub download_lyrics: bool,
    #[serde(default)]
    pub track_covers: std::collections::HashMap<String, String>,
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

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

// ── Progress payload ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackProgressPayload {
    pub track_id: String,
    pub phase: String,
    pub percent: u32,
    pub message: String,
    pub file_path: Option<String>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn format_duration(seconds: u32) -> String {
    format!("{}:{:02}", seconds / 60, seconds % 60)
}

fn clean_filename(input: &str) -> String {
    let re = Regex::new(r#"[\\/:*?"<>|]"#).unwrap();
    re.replace_all(input, "_").trim().to_string()
}

fn sanitize_path_segment(input: &str) -> String {
    let re = Regex::new(r#"[\\/:*?"<>|]"#).unwrap();
    let s = re.replace_all(input, "_").trim().to_string();
    if s.is_empty() { "Desconocido".to_string() } else { s }
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
            if t.is_empty() { "{trackNumber} - {artist} - {title}" } else { t }
        }
    }
}

fn render_track_filename(pattern: &str, track: &RipperTrack, ext: &str) -> String {
    let template = resolve_naming_template(pattern);

    let num = if track.track_number > 0 { format!("{:02}", track.track_number) } else { "01".to_string() };
    let year = if track.year.trim().is_empty() { "0000".to_string() } else { sanitize_tag_field(&track.year) };
    let safe_artist = sanitize_tag_field(if track.artist.trim().is_empty() { "Artista Desconocido" } else { &track.artist });
    let safe_title  = sanitize_tag_field(if track.title.trim().is_empty()  { "Pista Desconocida" }  else { &track.title });
    let safe_album  = sanitize_tag_field(if track.album.trim().is_empty()  { "Álbum Desconocido" }  else { &track.album });

    let mut rendered = template.to_string();

    for tok in &["{artist}", "{artista}", "{nombre Artista}", "{nombre_artista}", "{nombreArtista}"] {
        rendered = rendered.replace(tok, &safe_artist);
    }
    for tok in &["{album}", "{nombre album}", "{nombre_album}", "{nombreAlbum}"] {
        rendered = rendered.replace(tok, &safe_album);
    }
    for tok in &["{year}", "{año}", "{ano}", "{fecha}"] {
        rendered = rendered.replace(tok, &year);
    }
    for tok in &["{trackNumber}", "{track_number}", "{track}", "{numero}", "{pista}"] {
        rendered = rendered.replace(tok, &num);
    }
    for tok in &["{title}", "{titulo}", "{cancion}", "{nombre}"] {
        rendered = rendered.replace(tok, &safe_title);
    }
    for tok in &["{playlist}", "{album_playlist}"] {
        rendered = rendered.replace(tok, &safe_album);
    }
    for tok in &["{totalTracks}", "{total_tracks}", "{total}"] {
        rendered = rendered.replace(tok, "01");
    }

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

fn fastrand_id() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{:x}", now)
}

// ── Spotify analyze ───────────────────────────────────────────────────────────

async fn analyze_spotify(url: &str) -> Result<AnalyzeResult, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {}", e))?;

    let is_track    = url.contains("/track/");
    let is_album    = url.contains("/album/");
    let is_playlist = url.contains("/playlist/");

    let encoded_url: String = url::form_urlencoded::byte_serialize(url.as_bytes()).collect();
    let oembed_url = format!("https://open.spotify.com/oembed?url={}", encoded_url);

    let oembed_json: Option<serde_json::Value> = if let Ok(resp) = client.get(&oembed_url).send().await {
        resp.json().await.ok()
    } else {
        None
    };

    let title_from_oembed = oembed_json.as_ref()
        .and_then(|j| j.get("title")).and_then(|t| t.as_str())
        .unwrap_or("Spotify Audio").to_string();

    let cover_from_oembed = oembed_json.as_ref()
        .and_then(|j| j.get("thumbnail_url")).and_then(|t| t.as_str())
        .unwrap_or("").to_string();

    if is_track {
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
            title: title.clone(), artist,
            album: title.clone(), year: "".to_string(),
            track_number: 1, total_tracks: 1,
            duration: 0, duration_string: "--:--".to_string(),
            cover_url: cover_from_oembed,
            source_url: Some(url.to_string()),
        };
        return Ok(AnalyzeResult { kind: "track".to_string(), name: title, total_tracks: 1, tracks: vec![track] });
    }

    let html_resp = client.get(url).send().await
        .map_err(|e| format!("No se pudo conectar a Spotify: {}", e))?;
    let html = html_resp.text().await.map_err(|e| format!("Error leyendo página: {}", e))?;

    let next_data_re = Regex::new(r#"(?s)<script id="__NEXT_DATA__"[^>]*>(.*?)</script>"#).unwrap();
    let mut tracks = Vec::new();

    if let Some(caps) = next_data_re.captures(&html) {
        if let Some(json_str) = caps.get(1) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                if let Some(track_list) = v.pointer("/props/pageProps/state/data/entity/trackList")
                    .or_else(|| v.pointer("/props/pageProps/state/data/entity/tracks/items"))
                    .and_then(|x| x.as_array())
                {
                    for (i, t_val) in track_list.iter().enumerate() {
                        let t_obj = t_val.get("track").unwrap_or(t_val);
                        let name = t_obj.get("name").or_else(|| t_obj.get("title"))
                            .and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
                        if name.is_empty() { continue; }

                        let artist = t_obj.get("artists").and_then(|x| x.as_array())
                            .and_then(|arr| arr.first()).and_then(|a| a.get("name"))
                            .and_then(|x| x.as_str())
                            .or_else(|| t_obj.get("artist").and_then(|x| x.as_str()))
                            .unwrap_or("Artista Desconocido").to_string();

                        let dur_ms = t_obj.get("durationMs").or_else(|| t_obj.get("duration_ms"))
                            .and_then(|x| x.as_u64()).unwrap_or(0);
                        let dur_sec = (dur_ms / 1000) as u32;

                        let cover = t_obj.get("album").and_then(|a| a.get("images"))
                            .and_then(|img| img.as_array()).and_then(|arr| arr.first())
                            .and_then(|item| item.get("url")).and_then(|u| u.as_str())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| cover_from_oembed.clone());

                        tracks.push(RipperTrack {
                            id: format!("sp_{}", fastrand_id()),
                            title: name, artist,
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
        tracks.push(RipperTrack {
            id: format!("sp_{}", fastrand_id()),
            title: title_from_oembed.clone(), artist: "Spotify".to_string(),
            album: title_from_oembed.clone(), year: "".to_string(),
            track_number: 1, total_tracks: 1,
            duration: 0, duration_string: "--:--".to_string(),
            cover_url: cover_from_oembed,
            source_url: Some(url.to_string()),
        });
    }

    let kind_str = if is_album { "album" } else if is_playlist { "playlist" } else { "track" };
    Ok(AnalyzeResult { kind: kind_str.to_string(), name: title_from_oembed, total_tracks: tracks.len(), tracks })
}

// ── YouTube / search analyze ──────────────────────────────────────────────────

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
        if err.contains("403") || err.contains("outdated") || err.contains("older than") {
            if try_auto_update_ytdlp().await.is_ok() {
                output = Command::new(&bin).args(&args).output().await
                    .map_err(|e| format!("Error tras auto-reparación: {}", e))?;
            }
        }
    }

    if !output.status.success() {
        return Err(format!("yt-dlp error: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let mut tracks = Vec::new();
    let mut playlist_name = "Resultados de YouTube".to_string();
    let mut is_playlist = false;

    for (idx, line) in stdout_str.lines().enumerate() {
        let line_trimmed = line.trim();
        if line_trimmed.is_empty() { continue; }

        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line_trimmed) {
            if let Some(p_title) = v.get("playlist_title").and_then(|x| x.as_str()) {
                playlist_name = p_title.to_string();
                is_playlist = true;
            }

            let id       = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let title    = v.get("title").and_then(|x| x.as_str()).unwrap_or("Audio").to_string();
            let uploader = v.get("channel").or_else(|| v.get("uploader"))
                .and_then(|x| x.as_str()).unwrap_or("YouTube").to_string();

            let dur_sec = v.get("duration").and_then(|x| x.as_f64()).map(|d| d as u32).unwrap_or(0);
            let dur_str = v.get("duration_string").and_then(|x| x.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| if dur_sec > 0 { format_duration(dur_sec) } else { "--:--".to_string() });

            let cover = v.get("thumbnails").and_then(|x| x.as_array())
                .and_then(|arr| arr.last()).and_then(|item| item.get("url"))
                .and_then(|u| u.as_str())
                .or_else(|| v.get("thumbnail").and_then(|x| x.as_str()))
                .unwrap_or("").to_string();

            let video_url = if !id.is_empty() {
                format!("https://www.youtube.com/watch?v={}", id)
            } else {
                v.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string()
            };

            if video_url.is_empty() && id.is_empty() { continue; }

            tracks.push(RipperTrack {
                id: format!("yt_{}", if !id.is_empty() { id.clone() } else { fastrand_id() }),
                title,
                artist: uploader,
                album: playlist_name.clone(),
                year: "".to_string(),
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
        return Err("No se encontraron resultados para la búsqueda.".to_string());
    }

    let kind = if is_playlist { "playlist" } else if is_url { "track" } else { "search" };
    Ok(AnalyzeResult { kind: kind.to_string(), name: playlist_name, total_tracks: tracks.len(), tracks })
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Analyze a YouTube URL, playlist, or free-text search query.
#[tauri::command]
pub async fn analyze_source_link(url_or_query: String, limit: Option<u32>) -> Result<AnalyzeResult, String> {
    let trimmed = url_or_query.trim();
    if trimmed.is_empty() {
        return Err("Por favor ingresa un enlace o término de búsqueda.".to_string());
    }
    if trimmed.contains("open.spotify.com") || trimmed.contains("spotify.link") {
        return analyze_spotify(trimmed).await;
    }
    analyze_youtube_or_search(trimmed, limit.unwrap_or(20)).await
}

/// Download a batch of tracks with full format/quality/ID3 options.
/// Emits `download-track-progress` events per track.
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

    let mut target_dir = PathBuf::from(&options.output_folder);
    if options.save_in_folder {
        if let Some(folder_sub) = &options.folder_name {
            let clean_sub = clean_filename(folder_sub);
            if !clean_sub.is_empty() {
                target_dir = target_dir.join(clean_sub);
            }
        }
    }

    tokio::fs::create_dir_all(&target_dir).await
        .map_err(|e| format!("Error creando carpeta de descarga: {}", e))?;

    let bin = get_yt_dlp_binary();
    let semaphore = Arc::new(Semaphore::new(3));
    let downloaded_paths = Arc::new(Mutex::new(Vec::new()));
    let mut tasks = Vec::new();

    let cookies_file_path = write_cookies_file(options.youtube_cookies.as_deref(), &target_dir).await;
    let cookies_file_arc: Arc<Option<String>> = Arc::new(cookies_file_path);

    for track in tracks {
        let sem         = semaphore.clone();
        let app_handle  = app.clone();
        let cancel      = state.cancel_flag.clone();
        let pids_lock   = state.running_pids.clone();
        let bin_path    = bin.clone();
        let dest_dir    = target_dir.clone();
        let opt         = options.clone();
        let paths_acc   = downloaded_paths.clone();
        let cookies_arc = cookies_file_arc.clone();

        let task = tokio::spawn(async move {
            let _permit = match sem.acquire().await { Ok(p) => p, Err(_) => return };
            if cancel.load(Ordering::SeqCst) { return; }

            let track_id = track.id.clone();

            let emit = |phase: &str, pct: u32, msg: &str, fp: Option<String>| {
                let _ = app_handle.emit("download-track-progress", TrackProgressPayload {
                    track_id: track_id.clone(),
                    phase: phase.to_string(),
                    percent: pct,
                    message: msg.to_string(),
                    file_path: fp,
                });
            };

            emit("downloading", 5, &format!("Descargando: {}…", track.title), None);

            let query_target = if let Some(src) = &track.source_url {
                if src.contains("youtube.com") || src.contains("youtu.be") {
                    src.clone()
                } else {
                    format!("ytsearch1:{} - {}", track.artist, track.title)
                }
            } else {
                format!("ytsearch1:{} - {}", track.artist, track.title)
            };

            let temp_id  = fastrand_id();
            let is_video = opt.format == "mp4";
            let temp_out = dest_dir.join(format!("temp_{}.%(ext)s", temp_id)).to_string_lossy().to_string();

            let auth = CookieAuth {
                cookies_path: cookies_arc.as_ref().clone(),
                cookies_from_browser: opt.cookies_from_browser.clone(),
            };

            let mut yt_args: Vec<String> = if is_video {
                let vq = opt.video_quality.as_deref().unwrap_or("best");
                let fmt = match vq {
                    "1080" => "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]",
                    "720"  => "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]",
                    "480"  => "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]",
                    _      => "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
                };
                vec!["-f".into(), fmt.into(), "--merge-output-format".into(), "mp4".into(),
                     "--no-playlist".into(), "-o".into(), temp_out.clone()]
            } else {
                vec!["--extract-audio".into(), "--audio-format".into(), "wav".into(),
                     "--audio-quality".into(), "0".into(), "--no-playlist".into(),
                     "-o".into(), temp_out.clone()]
            };
            append_modern_ytdlp_args(&mut yt_args);
            auth.append_to(&mut yt_args);
            yt_args.push(query_target.clone());

            let mut cmd = Command::new(&bin_path);
            cmd.args(&yt_args)
               .stdout(std::process::Stdio::piped())
               .stderr(std::process::Stdio::piped());

            let mut child = match cmd.spawn() {
                Ok(c)  => c,
                Err(e) => { emit("error", 0, &format!("Error lanzando yt-dlp: {}", e), None); return; }
            };

            if let Some(pid) = child.id() { pids_lock.lock().await.push(pid); }

            let status = match child.wait().await {
                Ok(s)  => s,
                Err(e) => { emit("error", 0, &format!("Error en proceso: {}", e), None); return; }
            };

            if cancel.load(Ordering::SeqCst) || !status.success() {
                emit("error", 0, "Fallo descargando desde YouTube.", None);
                return;
            }

            // ── Video path ────────────────────────────────────────────────
            if is_video {
                let temp_mp4 = dest_dir.join(format!("temp_{}.mp4", temp_id));
                let temp_mkv = dest_dir.join(format!("temp_{}.mkv", temp_id));
                let temp_vid = if temp_mp4.exists() { temp_mp4 } else { temp_mkv };

                if !temp_vid.exists() {
                    emit("error", 0, "No se encontró el archivo de vídeo descargado.", None);
                    return;
                }
                emit("converting", 80, "Finalizando archivo de vídeo…", None);

                let final_rel  = render_track_filename(&opt.naming_pattern, &track, "mp4");
                let final_path = {
                    let full = dest_dir.join(&final_rel);
                    if let Some(p) = full.parent() { let _ = tokio::fs::create_dir_all(p).await; }
                    full
                };

                let mut ffmpeg = Command::new("ffmpeg");
                ffmpeg.arg("-y").arg("-nostdin").arg("-i").arg(&temp_vid).arg("-c").arg("copy");
                if opt.embed_id3_tags {
                    ffmpeg.arg("-metadata").arg(format!("title={}", track.title))
                        .arg("-metadata").arg(format!("artist={}", track.artist))
                        .arg("-metadata").arg(format!("album={}", track.album));
                }
                ffmpeg.arg(&final_path);

                let ff_ok = ffmpeg.output().await.map(|o| o.status.success()).unwrap_or(false);
                let _ = tokio::fs::remove_file(&temp_vid).await;

                let path_str = final_path.to_string_lossy().to_string();
                if ff_ok || final_path.exists() {
                    paths_acc.lock().await.push(path_str.clone());
                    emit("done", 100, "Descarga de vídeo completada", Some(path_str));
                } else {
                    emit("error", 0, "Error finalizando el archivo de vídeo.", None);
                }
                return;
            }

            // ── Audio path ────────────────────────────────────────────────
            let temp_wav = dest_dir.join(format!("temp_{}.wav", temp_id));
            if !temp_wav.exists() {
                emit("error", 0, "No se encontró el archivo WAV intermedio.", None);
                return;
            }

            emit("converting", 80, "Transcodificando y etiquetando metadatos…", None);

            let final_rel  = render_track_filename(&opt.naming_pattern, &track, &opt.format);
            let final_path = {
                let full = dest_dir.join(&final_rel);
                if let Some(p) = full.parent() { let _ = tokio::fs::create_dir_all(p).await; }
                full
            };

            // Download cover art for embedding
            let cover_url_opt = opt.track_covers.get(&track.id).cloned().or_else(|| {
                let t = track.cover_url.trim();
                if !t.is_empty() { Some(t.to_string()) } else { None }
            });

            let temp_cover_dir = std::env::temp_dir().join(format!("mx_cov_{}", temp_id));
            let local_cover_path: Option<PathBuf> = if opt.embed_id3_tags {
                if let Some(c_url) = &cover_url_opt {
                    let _ = tokio::fs::create_dir_all(&temp_cover_dir).await;
                    let cover_file = temp_cover_dir.join("cover.jpg");
                    // Simple HTTP download of cover art
                    if let Ok(resp) = reqwest::get(c_url).await {
                        if let Ok(bytes) = resp.bytes().await {
                            if tokio::fs::write(&cover_file, &bytes).await.is_ok() {
                                Some(cover_file)
                            } else { None }
                        } else { None }
                    } else { None }
                } else { None }
            } else { None };

            let mut ffmpeg = Command::new("ffmpeg");
            ffmpeg.arg("-y").arg("-nostdin").arg("-i").arg(&temp_wav);

            let has_cover = local_cover_path.is_some()
                && matches!(opt.format.as_str(), "mp3" | "flac" | "m4a");

            if let Some(ref c_path) = local_cover_path {
                if has_cover {
                    ffmpeg.arg("-i").arg(c_path)
                        .arg("-map").arg("0:a:0")
                        .arg("-map").arg("1:0");
                }
            }

            match opt.format.as_str() {
                "flac" => {
                    ffmpeg.arg("-c:a").arg("flac");
                    if has_cover { ffmpeg.arg("-c:v").arg("copy").arg("-disposition:v:0").arg("attached_pic"); }
                }
                "wav"  => { ffmpeg.arg("-c:a").arg("pcm_s16le"); }
                "m4a"  => {
                    ffmpeg.arg("-c:a").arg("aac").arg("-b:a").arg(&opt.bitrate);
                    if has_cover { ffmpeg.arg("-c:v").arg("copy").arg("-disposition:v:0").arg("attached_pic"); }
                }
                "opus" => { ffmpeg.arg("-c:a").arg("libopus").arg("-b:a").arg(&opt.bitrate); }
                _      => {
                    ffmpeg.arg("-c:a").arg("libmp3lame")
                        .arg("-b:a").arg(if opt.bitrate == "lossless" { "320k" } else { &opt.bitrate });
                    if has_cover {
                        ffmpeg.arg("-c:v").arg("mjpeg").arg("-pix_fmt").arg("yuvj420p")
                            .arg("-id3v2_version").arg("3")
                            .arg("-metadata:s:v").arg("title=Album cover")
                            .arg("-metadata:s:v").arg("comment=Cover (front)")
                            .arg("-disposition:v").arg("attached_pic");
                    }
                }
            }

            if let Some(sr) = opt.sample_rate {
                if sr > 0 && !matches!(opt.format.as_str(), "wav") {
                    ffmpeg.arg("-ar").arg(sr.to_string());
                }
            }

            if opt.embed_id3_tags {
                ffmpeg.arg("-metadata").arg(format!("title={}", track.title))
                    .arg("-metadata").arg(format!("artist={}", track.artist))
                    .arg("-metadata").arg(format!("album={}", track.album))
                    .arg("-metadata").arg(format!("track={}", track.track_number));
                if !track.year.is_empty() {
                    ffmpeg.arg("-metadata").arg(format!("date={}", track.year));
                }
            }

            ffmpeg.arg(&final_path);
            let ff_status = ffmpeg.output().await;

            let _ = tokio::fs::remove_file(&temp_wav).await;
            if temp_cover_dir.exists() { let _ = tokio::fs::remove_dir_all(&temp_cover_dir).await; }

            match ff_status {
                Ok(out) if out.status.success() => {
                    let path_str = final_path.to_string_lossy().to_string();
                    paths_acc.lock().await.push(path_str.clone());
                    emit("done", 100, "Descarga completada", Some(path_str));
                }
                _ => { emit("error", 0, "Error al transcodificar el archivo final con FFmpeg.", None); }
            }
        });

        tasks.push(task);
    }

    for task in tasks { let _ = task.await; }

    let results = downloaded_paths.lock().await.clone();
    Ok(results)
}

/// Cancel all active downloads.
#[tauri::command]
pub async fn cancel_download_batch(state: State<'_, DownloaderState>) -> Result<(), String> {
    state.cancel_flag.store(true, Ordering::SeqCst);
    let mut pids = state.running_pids.lock().await;
    for pid in pids.drain(..) {
        let _ = Command::new("kill").arg("-9").arg(pid.to_string()).output().await;
    }
    Ok(())
}

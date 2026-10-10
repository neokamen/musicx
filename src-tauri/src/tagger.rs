use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::fs;

use crate::commands::AppState;
use crate::ytdlp::get_ffmpeg_binary;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackTagInfo {
    pub path: String,
    pub filename: String,
    pub ext: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<String>,
    pub track: Option<String>,
    pub genre: Option<String>,
    pub comment: Option<String>,
    pub duration: f64,
    pub bit_rate: u64,
    pub has_cover: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackTagUpdate {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<String>,
    pub track: Option<String>,
    pub genre: Option<String>,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTagItem {
    pub file_path: String,
    pub tags: TrackTagUpdate,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OnlineCoverResult {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover_url: String,
    pub thumbnail_url: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineMetadataResult {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub year: String,
    pub genre: String,
}

#[derive(Debug, Deserialize)]
struct ItunesSearchResponse {
    #[serde(default)]
    results: Vec<ItunesItem>,
}

#[derive(Debug, Deserialize)]
struct ItunesItem {
    #[serde(rename = "collectionId")]
    collection_id: Option<u64>,
    #[serde(rename = "trackId")]
    track_id: Option<u64>,
    #[serde(rename = "artistName")]
    artist_name: Option<String>,
    #[serde(rename = "collectionName")]
    collection_name: Option<String>,
    #[serde(rename = "trackName")]
    track_name: Option<String>,
    #[serde(rename = "artworkUrl100")]
    artwork_url_100: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeezerSearchResponse {
    #[serde(default)]
    data: Vec<DeezerTrack>,
}

#[derive(Debug, Deserialize)]
struct DeezerTrack {
    id: u64,
    title: Option<String>,
    artist: Option<DeezerArtist>,
    album: Option<DeezerAlbum>,
}

#[derive(Debug, Deserialize)]
struct DeezerArtist {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DeezerAlbum {
    title: Option<String>,
    #[serde(rename = "cover_medium")]
    cover_medium: Option<String>,
    #[serde(rename = "cover_xl")]
    cover_xl: Option<String>,
}

fn upgrade_itunes_artwork(url: &str, target_size: u32) -> String {
    let needle = "100x100bb";
    if url.contains(needle) {
        url.replace(needle, &format!("{target_size}x{target_size}bb"))
    } else {
        url.replace("60x60bb", &format!("{target_size}x{target_size}bb"))
    }
}

fn encode_query(q: &str) -> String {
    url::form_urlencoded::byte_serialize(q.as_bytes()).collect()
}

fn decode_html(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

async fn search_itunes(client: &reqwest::Client, query: &str) -> Vec<OnlineCoverResult> {
    let mut results = Vec::new();
    let encoded = encode_query(query);

    let album_url = format!("https://itunes.apple.com/search?term={encoded}&entity=album&limit=25");
    if let Ok(res) = client.get(&album_url).send().await {
        if res.status().is_success() {
            if let Ok(data) = res.json::<ItunesSearchResponse>().await {
                for item in data.results {
                    if let Some(art) = item.artwork_url_100 {
                        let high_res = upgrade_itunes_artwork(&art, 1200);
                        let thumb = upgrade_itunes_artwork(&art, 300);
                        let album = item.collection_name.unwrap_or_default();
                        let artist = item.artist_name.unwrap_or_default();
                        let id = format!("itunes-album-{}", item.collection_id.unwrap_or(0));

                        results.push(OnlineCoverResult {
                            id,
                            title: album.clone(),
                            artist,
                            album,
                            cover_url: high_res,
                            thumbnail_url: thumb,
                            source: "iTunes".to_string(),
                        });
                    }
                }
            }
        }
    }

    if results.len() < 15 {
        let song_url = format!("https://itunes.apple.com/search?term={encoded}&entity=song&limit=15");
        if let Ok(res) = client.get(&song_url).send().await {
            if res.status().is_success() {
                if let Ok(data) = res.json::<ItunesSearchResponse>().await {
                    for item in data.results {
                        if let Some(art) = item.artwork_url_100 {
                            let high_res = upgrade_itunes_artwork(&art, 1200);
                            let thumb = upgrade_itunes_artwork(&art, 300);
                            let title = item.track_name.unwrap_or_default();
                            let album = item.collection_name.unwrap_or_default();
                            let artist = item.artist_name.unwrap_or_default();
                            let id = format!("itunes-song-{}", item.track_id.unwrap_or(0));

                            results.push(OnlineCoverResult {
                                id,
                                title,
                                artist,
                                album,
                                cover_url: high_res,
                                thumbnail_url: thumb,
                                source: "iTunes".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    results
}

async fn search_deezer(client: &reqwest::Client, query: &str) -> Vec<OnlineCoverResult> {
    let mut results = Vec::new();
    let encoded = encode_query(query);
    let url = format!("https://api.deezer.com/search?q={encoded}&limit=20");

    if let Ok(res) = client.get(&url).send().await {
        if res.status().is_success() {
            if let Ok(data) = res.json::<DeezerSearchResponse>().await {
                for item in data.data {
                    if let Some(album) = item.album {
                        if let Some(cover_xl) = album.cover_xl {
                            let thumb = album.cover_medium.unwrap_or_else(|| cover_xl.clone());
                            let artist = item.artist.and_then(|a| a.name).unwrap_or_default();
                            let album_title = album.title.unwrap_or_default();
                            let title = item.title.unwrap_or_else(|| album_title.clone());

                            results.push(OnlineCoverResult {
                                id: format!("deezer-{}", item.id),
                                title,
                                artist,
                                album: album_title,
                                cover_url: cover_xl,
                                thumbnail_url: thumb,
                                source: "Deezer".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    results
}

async fn search_web_images(client: &reqwest::Client, query: &str) -> Vec<OnlineCoverResult> {
    let mut results = Vec::new();
    let query_str = format!("{query} album cover");
    let encoded = encode_query(&query_str);
    let url = format!("https://www.bing.com/images/search?q={encoded}&form=HDRSC2&first=1");

    let req = client
        .get(&url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        );

    if let Ok(res) = req.send().await {
        if res.status().is_success() {
            if let Ok(html) = res.text().await {
                if let Ok(re) = regex::Regex::new(r#"m=["'](\{.+?\})["']"#) {
                    for cap in re.captures_iter(&html) {
                        if let Some(m_json) = cap.get(1) {
                            let unescaped = decode_html(m_json.as_str());
                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&unescaped) {
                                let murl = val.get("murl").and_then(|v| v.as_str()).unwrap_or("");
                                let turl = val.get("turl").and_then(|v| v.as_str()).unwrap_or(murl);
                                let title = val.get("t").and_then(|v| v.as_str()).unwrap_or("");

                                if (murl.starts_with("http://") || murl.starts_with("https://"))
                                    && !murl.contains(".svg")
                                {
                                    results.push(OnlineCoverResult {
                                        id: format!("web-{}", results.len()),
                                        title: title.to_string(),
                                        artist: String::new(),
                                        album: title.to_string(),
                                        cover_url: murl.to_string(),
                                        thumbnail_url: turl.to_string(),
                                        source: "Web (Google/Bing)".to_string(),
                                    });
                                    if results.len() >= 16 {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    results
}

#[tauri::command]
pub async fn search_online_covers(
    query: String,
    source: Option<String>,
) -> Result<Vec<OnlineCoverResult>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    if source.as_deref() == Some("web")
        || source.as_deref() == Some("bing")
        || source.as_deref() == Some("google")
    {
        let web_results = search_web_images(&client, trimmed).await;
        let mut seen = HashSet::new();
        let mut deduped = Vec::new();
        for item in web_results {
            if seen.insert(item.cover_url.clone()) {
                deduped.push(item);
                if deduped.len() >= 16 {
                    break;
                }
            }
        }
        return Ok(deduped);
    }

    let mut results = search_itunes(&client, trimmed).await;
    if results.len() < 16 {
        let deezer_results = search_deezer(&client, trimmed).await;
        results.extend(deezer_results);
    }
    if results.len() < 6 {
        let web_results = search_web_images(&client, trimmed).await;
        results.extend(web_results);
    }

    let mut seen_covers = HashSet::new();
    let mut seen_pairs = HashSet::new();
    let mut deduplicated = Vec::new();

    for item in results {
        let pair_key = format!(
            "{}:{}",
            item.artist.trim().to_lowercase(),
            item.album.trim().to_lowercase()
        );

        if !seen_covers.insert(item.cover_url.clone()) {
            continue;
        }

        if !item.album.trim().is_empty() && !seen_pairs.insert(pair_key) {
            continue;
        }

        deduplicated.push(item);
        if deduplicated.len() >= 24 {
            break;
        }
    }

    Ok(deduplicated)
}

#[tauri::command]
pub async fn fetch_online_metadata(query: String) -> Result<Option<OnlineMetadataResult>, String> {
    let covers = search_online_covers(query, Some("all".to_string())).await?;
    if let Some(first) = covers.first() {
        Ok(Some(OnlineMetadataResult {
            title: first.title.clone(),
            artist: first.artist.clone(),
            album: first.album.clone(),
            year: "".into(),
            genre: "".into(),
        }))
    } else {
        Ok(None)
    }
}

pub async fn resolve_cover_to_local_path(cover_input: &str, work_dir: &Path) -> Result<PathBuf, String> {
    let trimmed = cover_input.trim();
    if trimmed.is_empty() {
        return Err("Empty cover input".into());
    }

    if trimmed.starts_with("data:") {
        let comma_idx = trimmed.find(',').ok_or_else(|| "Invalid data URL".to_string())?;
        let meta_part = &trimmed[..comma_idx];
        let b64_part = &trimmed[comma_idx + 1..];

        let ext = if meta_part.contains("png") {
            "png"
        } else if meta_part.contains("webp") {
            "webp"
        } else {
            "jpg"
        };

        use base64::Engine;
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(b64_part.trim())
            .map_err(|e| format!("Base64 decode error: {e}"))?;

        let path = work_dir.join(format!("cover.{ext}"));
        fs::write(&path, decoded).await.map_err(|e| format!("Failed to write decoded cover: {e}"))?;
        return Ok(path);
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| format!("HTTP client error: {e}"))?;

        let resp = client.get(trimmed).send().await
            .map_err(|e| format!("Failed to fetch cover image: {e}"))?;

        let bytes = resp.bytes().await
            .map_err(|e| format!("Failed to read cover image bytes: {e}"))?;

        let ext = if trimmed.ends_with(".png") {
            "png"
        } else if trimmed.ends_with(".webp") {
            "webp"
        } else {
            "jpg"
        };

        let path = work_dir.join(format!("cover.{ext}"));
        fs::write(&path, bytes).await.map_err(|e| format!("Failed to save downloaded cover: {e}"))?;
        return Ok(path);
    }

    let local = PathBuf::from(trimmed);
    if local.exists() {
        return Ok(local);
    }

    Err(format!("Cover image not found: {trimmed}"))
}

#[tauri::command]
pub async fn load_image_data_url(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Image not found: {path}"));
    }
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("jpeg").to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => "image/jpeg",
    };
    let bytes = fs::read(p).await.map_err(|e| format!("Failed to read image: {e}"))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

#[tauri::command]
pub async fn read_single_track_tags(
    file_path: String,
) -> Result<TrackTagInfo, String> {
    let p = PathBuf::from(&file_path);
    if !p.is_file() {
        return Err(format!("El archivo no existe: {file_path}"));
    }
    let filename = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    let meta = crate::db::extract_metadata(&p);
    let has_cover = crate::commands::get_track_cover_art(file_path.clone()).is_some();

    if let Some(m) = meta {
        Ok(TrackTagInfo {
            path: file_path,
            filename,
            ext,
            title: Some(m.title),
            artist: Some(m.artist),
            album: Some(m.album),
            year: None,
            track: m.track_number.map(|n| n.to_string()),
            genre: None,
            comment: None,
            duration: m.duration_seconds,
            bit_rate: (m.bitrate_kbps as u64) * 1000,
            has_cover,
        })
    } else {
        Ok(TrackTagInfo {
            path: file_path,
            filename: filename.clone(),
            ext,
            title: Some(p.file_stem().and_then(|s| s.to_str()).unwrap_or(&filename).to_string()),
            artist: None,
            album: None,
            year: None,
            track: None,
            genre: None,
            comment: None,
            duration: 0.0,
            bit_rate: 0,
            has_cover,
        })
    }
}

#[tauri::command]
pub async fn read_folder_tracks(
    folder_path: String,
) -> Result<Vec<TrackTagInfo>, String> {
    let dir = PathBuf::from(&folder_path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {folder_path}"));
    }

    let audio_exts = ["flac", "mp3", "wav", "ogg", "opus", "aac", "m4a", "alac", "aiff", "wma"];
    let mut tracks = Vec::new();
    let mut read_dir = fs::read_dir(&dir).await.map_err(|e| format!("Failed to read dir: {e}"))?;

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let path = entry.path();
        if path.is_file() {
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if audio_exts.contains(&ext.as_str()) {
                let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                let path_str = path.to_string_lossy().to_string();
                let meta = crate::db::extract_metadata(&path);
                let has_cover = crate::commands::get_track_cover_art(path_str.clone()).is_some();

                if let Some(m) = meta {
                    tracks.push(TrackTagInfo {
                        path: path_str,
                        filename,
                        ext,
                        title: Some(m.title),
                        artist: Some(m.artist),
                        album: Some(m.album),
                        year: None,
                        track: m.track_number.map(|n| n.to_string()),
                        genre: None,
                        comment: None,
                        duration: m.duration_seconds,
                        bit_rate: (m.bitrate_kbps as u64) * 1000,
                        has_cover,
                    });
                } else {
                    tracks.push(TrackTagInfo {
                        path: path_str,
                        filename: filename.clone(),
                        ext,
                        title: Some(path.file_stem().and_then(|s| s.to_str()).unwrap_or(&filename).to_string()),
                        artist: None,
                        album: None,
                        year: None,
                        track: None,
                        genre: None,
                        comment: None,
                        duration: 0.0,
                        bit_rate: 0,
                        has_cover,
                    });
                }
            }
        }
    }

    tracks.sort_by(|a, b| {
        let num_a = a.track.as_deref().and_then(|t| t.split('/').next()).and_then(|n| n.parse::<u32>().ok());
        let num_b = b.track.as_deref().and_then(|t| t.split('/').next()).and_then(|n| n.parse::<u32>().ok());
        match (num_a, num_b) {
            (Some(na), Some(nb)) => na.cmp(&nb),
            _ => a.filename.cmp(&b.filename),
        }
    });

    Ok(tracks)
}

#[tauri::command]
pub async fn write_track_tags(
    file_path: String,
    tags: TrackTagUpdate,
    cover_url: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let input_path = PathBuf::from(&file_path);
    if !input_path.is_file() {
        return Err(format!("File not found: {file_path}"));
    }

    let parent = input_path.parent().unwrap_or_else(|| Path::new("."));
    let ext = input_path.extension().and_then(|e| e.to_str()).unwrap_or("mp3").to_lowercase();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp_output = parent.join(format!(".tmp_tagged_{}_{}.{}", std::process::id(), nonce, ext));

    let work_dir = tempfile::Builder::new()
        .prefix("musicx-tag-cover-")
        .tempdir()
        .map_err(|e| format!("Temp dir error: {e}"))?;

    let local_cover = if let Some(cover_src) = &cover_url {
        match resolve_cover_to_local_path(cover_src, work_dir.path()).await {
            Ok(p) => Some(p),
            Err(e) => {
                eprintln!("[TAGGER] Warning: could not resolve cover: {e}");
                None
            }
        }
    } else {
        None
    };

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-hide_banner".into(),
        "-loglevel".into(), "error".into(),
        "-i".into(), file_path.clone(),
    ];

    let has_cover = local_cover.is_some() && matches!(ext.as_str(), "mp3" | "flac" | "m4a" | "aac");
    if let Some(cp) = &local_cover {
        if has_cover {
            args.extend(["-i".into(), cp.to_string_lossy().to_string()]);
            args.extend(["-map".into(), "0:a".into(), "-map".into(), "1:0".into()]);
        } else {
            args.extend(["-map".into(), "0".into()]);
        }
    } else {
        args.extend(["-map".into(), "0".into()]);
    }

    // Audio stream copy without re-encoding!
    args.extend(["-c:a".into(), "copy".into()]);

    if has_cover {
        if ext == "mp3" {
            args.extend([
                "-c:v".into(), "mjpeg".into(),
                "-pix_fmt".into(), "yuvj420p".into(),
                "-id3v2_version".into(), "3".into(),
                "-metadata:s:v".into(), "title=Album cover".into(),
                "-metadata:s:v".into(), "comment=Cover (front)".into(),
                "-disposition:v".into(), "attached_pic".into(),
            ]);
        } else if matches!(ext.as_str(), "flac" | "m4a" | "aac") {
            args.extend([
                "-c:v".into(), "copy".into(),
                "-disposition:v".into(), "attached_pic".into(),
            ]);
        }
    }

    // Metadata tags
    if let Some(v) = &tags.title {
        args.extend(["-metadata".into(), format!("title={v}")]);
    }
    if let Some(v) = &tags.artist {
        args.extend(["-metadata".into(), format!("artist={v}")]);
    }
    if let Some(v) = &tags.album {
        args.extend(["-metadata".into(), format!("album={v}")]);
    }
    if let Some(v) = &tags.year {
        args.extend(["-metadata".into(), format!("date={v}"), "-metadata".into(), format!("year={v}")]);
    }
    if let Some(v) = &tags.track {
        args.extend(["-metadata".into(), format!("track={v}")]);
    }
    if let Some(v) = &tags.genre {
        args.extend(["-metadata".into(), format!("genre={v}")]);
    }
    if let Some(v) = &tags.comment {
        args.extend(["-metadata".into(), format!("comment={v}")]);
    }

    args.push(temp_output.to_string_lossy().to_string());

    let ffmpeg_bin = get_ffmpeg_binary();
    let output = tokio::process::Command::new(&ffmpeg_bin)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to spawn ffmpeg: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = fs::remove_file(&temp_output).await;
        return Err(format!("Failed to write tags: {stderr}"));
    }

    // Replace original file atomically
    fs::rename(&temp_output, &input_path).await
        .map_err(|e| format!("Failed to replace original file: {e}"))?;

    // Upsert fresh metadata in SQLite library database
    if let Some(fresh_meta) = crate::db::extract_metadata(&input_path) {
        let _ = state.db.upsert_track(&fresh_meta);
    }

    Ok(())
}

#[tauri::command]
pub async fn batch_write_folder_tags(
    requests: Vec<BatchTagItem>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    for req in requests {
        write_track_tags(req.file_path, req.tags, req.cover_url, state.clone()).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn generate_spectrogram(
    input_path: String,
    palette: Option<String>,
) -> Result<String, String> {
    let safe_palette = match palette.as_deref().unwrap_or("magma").to_lowercase().as_str() {
        "magma" | "fire" | "plasma" | "viridis" | "rainbow" | "nebulae" | "cool"
        | "green" | "cividis" | "fruit" | "fiery" | "moreland" | "terrain" | "intensity" | "channel" => {
            palette.unwrap_or_else(|| "magma".to_string()).to_lowercase()
        }
        _ => "magma".to_string(),
    };

    let work_dir = tempfile::Builder::new()
        .prefix("musicx-spectrogram-")
        .tempdir()
        .map_err(|e| format!("Temp dir error: {e}"))?;

    let spec_path = work_dir.path().join("spectrogram.png");
    let ffmpeg_bin = get_ffmpeg_binary();

    let args = [
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-i", &input_path,
        "-lavfi",
        &format!("showspectrumpic=s=1000x1000:mode=combined:color={safe_palette}:scale=log:fscale=log:legend=1"),
        "-f", "image2",
        "-update", "1",
        &spec_path.to_string_lossy(),
    ];

    let output = tokio::process::Command::new(&ffmpeg_bin)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to generate spectrogram: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("Spectrogram failed: {stderr}"));
    }

    let bytes = fs::read(&spec_path).await.map_err(|e| format!("Failed to read spectrogram image: {e}"))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/png;base64,{b64}"))
}

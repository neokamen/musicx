use crate::audio::{get_available_audio_devices, AudioCommand};
use crate::db::{self, DatabaseManager};
use crate::fs_lazy;
use crate::models::{AudioTelemetry, BufferTelemetry, FileEntry, TrackMetadata};
use crate::radio_relay::{self, RadioRelayState};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};

pub struct AppState {
    pub audio: Arc<crate::audio::AudioEngineHandle>,
    pub db: Arc<DatabaseManager>,
    pub radio_relay: Arc<RadioRelayState>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct AudioEngineStatus {
    pub engine: String,
    pub status: String,
    pub sample_rate: u32,
    pub bit_depth: u16,
    pub channels: u16,
    pub driver: String,
    pub supported_codecs: Vec<String>,
}

#[tauri::command]
pub fn get_audio_engine_status(state: State<'_, AppState>) -> AudioEngineStatus {
    let tele = state.audio.get_telemetry();
    let status_str = match tele.state {
        crate::models::PlaybackState::Playing => "Playing",
        crate::models::PlaybackState::Paused => "Paused",
        crate::models::PlaybackState::Stopped => "Ready / Idle",
    };

    AudioEngineStatus {
        engine: "musicx Hi-Fi Bit-Perfect Core (Rust)".to_string(),
        status: status_str.to_string(),
        sample_rate: if tele.sample_rate > 0 { tele.sample_rate } else { 192_000 },
        bit_depth: if tele.bit_depth > 0 { tele.bit_depth } else { 24 },
        channels: tele.channels,
        driver: tele.output_device,
        supported_codecs: vec![
            "FLAC (Lossless 24/192)".to_string(),
            "WAV (PCM / IEEE-Float)".to_string(),
            "MP3".to_string(),
            "ALAC / AAC (MP4 container)".to_string(),
            "OGG / Vorbis".to_string(),
        ],
    }
}

#[tauri::command]
pub fn get_telemetry(state: State<'_, AppState>) -> AudioTelemetry {
    state.audio.get_telemetry()
}

#[tauri::command]
pub fn play_track(
    path: String,
    bit_perfect: Option<bool>,
    device_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.audio.send(AudioCommand::PlayTrack {
        path,
        bit_perfect: bit_perfect.unwrap_or(false),
        device_name,
    });
    Ok(())
}

#[tauri::command]
pub fn pause_track(state: State<'_, AppState>) -> Result<(), String> {
    state.audio.send(AudioCommand::Pause);
    Ok(())
}

#[tauri::command]
pub fn resume_track(state: State<'_, AppState>) -> Result<(), String> {
    state.audio.send(AudioCommand::Play);
    Ok(())
}

#[tauri::command]
pub fn stop_track(state: State<'_, AppState>) -> Result<(), String> {
    state.audio.send(AudioCommand::Stop);
    Ok(())
}

#[tauri::command]
pub fn seek_track(position_seconds: f64, state: State<'_, AppState>) -> Result<(), String> {
    state.audio.send(AudioCommand::Seek(position_seconds));
    Ok(())
}

#[tauri::command]
pub fn set_volume(volume: f32, state: State<'_, AppState>) -> Result<(), String> {
    state.audio.send(AudioCommand::SetVolume(volume));
    Ok(())
}

#[tauri::command]
pub fn set_output_device(
    device_name: Option<String>,
    bit_perfect: Option<bool>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.audio.send(AudioCommand::SetOutputDevice {
        device_name,
        bit_perfect: bit_perfect.unwrap_or(false),
    });
    Ok(())
}

#[tauri::command]
pub fn list_audio_devices() -> Vec<String> {
    get_available_audio_devices()
}

#[tauri::command]
pub fn get_library_tracks(state: State<'_, AppState>) -> Result<Vec<TrackMetadata>, String> {
    state.db.get_all_tracks().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_directory(path: String, app_handle: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let p = PathBuf::from(path);
    if !p.exists() || !p.is_dir() {
        return Err("Ruta de directorio inválida".to_string());
    }
    db::scan_directory_incremental(p, Arc::clone(&state.db), app_handle);
    Ok(())
}

#[tauri::command]
pub fn read_directory_lazy(path: String) -> Result<Vec<FileEntry>, String> {
    fs_lazy::read_directory_lazy_internal(path)
}

#[tauri::command]
pub fn get_track_cover_art(path: String) -> Option<String> {
    use base64::Engine;
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return None;
    }

    // 1. Try reading embedded picture tag from symphonia metadata across current and past revisions
    if let Ok(file) = std::fs::File::open(p) {
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        let mut hint = symphonia::core::probe::Hint::new();
        hint.with_extension(&ext);
        let mss = symphonia::core::io::MediaSourceStream::new(Box::new(file), Default::default());
        let format_opts = symphonia::core::formats::FormatOptions::default();
        let metadata_opts = symphonia::core::meta::MetadataOptions::default();

        if let Ok(mut probed) = symphonia::default::get_probe().format(&hint, mss, &format_opts, &metadata_opts) {
            // Check container format metadata
            if let Some(metadata) = probed.format.metadata().current() {
                if let Some(visual) = metadata.visuals().first() {
                    let mime = if visual.media_type.is_empty() {
                        "image/jpeg"
                    } else {
                        &visual.media_type
                    };
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&visual.data);
                    return Some(format!("data:{};base64,{}", mime, b64));
                }
            }
            // Check stream-level metadata
            if let Some(meta_ref) = probed.metadata.get() {
                if let Some(rev) = meta_ref.current() {
                    if let Some(visual) = rev.visuals().first() {
                        let mime = if visual.media_type.is_empty() {
                            "image/jpeg"
                        } else {
                            &visual.media_type
                        };
                        let b64 = base64::engine::general_purpose::STANDARD.encode(&visual.data);
                        return Some(format!("data:{};base64,{}", mime, b64));
                    }
                }
            }
        }
    }

    // 2. Fallback: Search parent directory for common cover image files
    if let Some(parent) = p.parent() {
        let candidates = [
            "cover.jpg", "cover.png", "cover.jpeg", "cover.webp",
            "folder.jpg", "folder.png", "folder.jpeg", "folder.webp",
            "front.jpg", "front.png", "front.jpeg", "front.webp",
            "album.jpg", "album.png", "album.jpeg", "album.webp",
            "Cover.jpg", "Cover.png", "Folder.jpg", "Folder.png",
        ];
        for candidate in &candidates {
            let img_path = parent.join(candidate);
            if img_path.exists() && img_path.is_file() {
                if let Ok(bytes) = std::fs::read(&img_path) {
                    let ext = candidate.split('.').last().unwrap_or("jpeg").to_lowercase();
                    let mime = match ext.as_str() {
                        "png" => "image/png",
                        "webp" => "image/webp",
                        _ => "image/jpeg",
                    };
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                    return Some(format!("data:{};base64,{}", mime, b64));
                }
            }
        }
    }

    None
}

#[tauri::command]
pub fn set_dsp_settings(
    state: State<'_, AppState>,
    settings: crate::audio::DspSettings,
) -> Result<(), String> {
    state.audio.send(crate::audio::AudioCommand::SetDspSettings(settings));
    Ok(())
}

#[tauri::command]
pub fn get_buffer_telemetry(state: State<'_, AppState>) -> BufferTelemetry {
    state.audio.get_buffer_telemetry()
}

#[tauri::command]
pub fn set_audio_buffer_size(
    state: State<'_, AppState>,
    frames: u32,
) -> Result<u32, String> {
    state.audio.set_buffer_size(frames)
}

#[tauri::command]
pub fn reset_audio_xruns(state: State<'_, AppState>) -> Result<(), String> {
    state.audio.reset_xruns();
    Ok(())
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(p, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<Option<String>, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(p).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_radio_relay(
    url: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    radio_relay::start(url, app_handle, &state.radio_relay)
}

#[tauri::command]
pub fn stop_radio_relay(state: State<'_, AppState>) -> Result<(), String> {
    radio_relay::stop(&state.radio_relay);
    Ok(())
}

#[tauri::command]
pub fn save_radio_recording(
    target_dir: String,
    filename: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let dir_path = std::path::Path::new(&target_dir);
    if !dir_path.exists() {
        std::fs::create_dir_all(dir_path).map_err(|e| e.to_string())?;
    }
    let sanitized_filename = filename
        .chars()
        .map(|c| if c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|' { '_' } else { c })
        .collect::<String>();
    let file_path = dir_path.join(sanitized_filename);
    std::fs::write(&file_path, data).map_err(|e| e.to_string())?;
    Ok(file_path.to_string_lossy().to_string())
}


// ── YouTube Music via yt-dlp ─────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct YtmTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u64,
    pub duration_string: String,
    pub thumbnail: String,
    pub webpage_url: String,
}

#[derive(serde::Deserialize, Debug, Default)]
struct YtDlpEntry {
    id: Option<String>,
    title: Option<String>,
    uploader: Option<String>,
    album: Option<String>,
    duration: Option<f64>,
    duration_string: Option<String>,
    thumbnail: Option<String>,
    webpage_url: Option<String>,
    url: Option<String>,
}

/// Search YouTube Music using yt-dlp (ytmsearch).
#[tauri::command]
pub fn ytm_search(query: String, limit: Option<u32>) -> Result<Vec<YtmTrack>, String> {
    let lim = limit.unwrap_or(20);
    let search_query = format!("ytmsearch{}:{}", lim, query);

    let output = std::process::Command::new("yt-dlp")
        .args([
            "--dump-json",
            "--no-playlist",
            "--flat-playlist",
            "--quiet",
            "--no-warnings",
            "--ignore-errors",
            &search_query,
        ])
        .output()
        .map_err(|e| format!("yt-dlp no encontrado o falló: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut tracks = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }
        if let Ok(entry) = serde_json::from_str::<YtDlpEntry>(line) {
            let id = entry.id.clone().unwrap_or_default();
            if id.is_empty() { continue; }
            let webpage_url = entry.webpage_url
                .or(entry.url)
                .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={}", id));
            let duration_secs = entry.duration.unwrap_or(0.0) as u64;
            let duration_string = entry.duration_string.unwrap_or_else(|| {
                format!("{}:{:02}", duration_secs / 60, duration_secs % 60)
            });
            tracks.push(YtmTrack {
                id,
                title: entry.title.unwrap_or_else(|| "Sin título".to_string()),
                artist: entry.uploader.unwrap_or_else(|| "Desconocido".to_string()),
                album: entry.album.unwrap_or_default(),
                duration: duration_secs,
                duration_string,
                thumbnail: entry.thumbnail.unwrap_or_default(),
                webpage_url,
            });
        }
    }

    Ok(tracks)
}

#[derive(serde::Deserialize, Debug)]
pub struct YtmDownloadOptions {
    pub url: String,
    pub output_folder: String,
    pub format: String,
    pub bitrate: String,
    pub sample_rate: Option<u32>,
    pub embed_id3: bool,
    pub save_in_folder: bool,
    pub naming_pattern: Option<String>,
}

/// Download a track from YouTube Music using yt-dlp.
#[tauri::command]
pub fn ytm_download(options: YtmDownloadOptions) -> Result<String, String> {
    let output_folder = std::path::Path::new(&options.output_folder);
    if !output_folder.exists() {
        std::fs::create_dir_all(output_folder).map_err(|e| e.to_string())?;
    }

    let naming = options.naming_pattern.as_deref()
        .unwrap_or("%(uploader)s/%(album)s/%(title)s");
    let outtmpl = format!("{}/{}.%(ext)s", options.output_folder, naming);

    let (audio_format, audio_quality) = match options.format.as_str() {
        "flac" => ("flac", "0"),
        "wav"  => ("wav",  "0"),
        "m4a"  => ("m4a",  "0"),
        "opus" => ("opus", "0"),
        "ogg"  => ("vorbis", "0"),
        _      => ("mp3", match options.bitrate.as_str() {
            "128k" => "5",
            "192k" => "3",
            "256k" => "2",
            _      => "0",
        }),
    };

    let mut args: Vec<String> = vec![
        "--no-playlist".into(),
        "-x".into(),
        "--audio-format".into(), audio_format.into(),
        "--audio-quality".into(), audio_quality.into(),
        "-o".into(), outtmpl,
        "--quiet".into(),
        "--no-warnings".into(),
    ];

    if options.embed_id3 {
        args.extend(["--embed-metadata".into(), "--embed-thumbnail".into(),
                      "--convert-thumbnails".into(), "jpg".into()]);
    }
    args.push(options.url.clone());

    let result = std::process::Command::new("yt-dlp")
        .args(&args)
        .output()
        .map_err(|e| format!("yt-dlp no encontrado: {}", e))?;

    if !result.status.success() {
        return Err(String::from_utf8_lossy(&result.stderr).to_string());
    }
    Ok(format!("Descargado en: {}", options.output_folder))
}

/// Download a track to a temp file for immediate playback, returns the local path.
#[tauri::command]
pub fn ytm_stream_to_temp(url: String) -> Result<String, String> {
    let tmp_dir = std::env::temp_dir().join("musicx_ytm");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let outtmpl = tmp_dir.join("%(id)s.%(ext)s").to_string_lossy().to_string();

    let result = std::process::Command::new("yt-dlp")
        .args([
            "--no-playlist", "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "-o", &outtmpl,
            "--quiet", "--no-warnings",
            "--print", "after_move:filepath",
            &url,
        ])
        .output()
        .map_err(|e| format!("yt-dlp no encontrado: {}", e))?;

    if !result.status.success() {
        return Err(String::from_utf8_lossy(&result.stderr).to_string());
    }
    let path = String::from_utf8_lossy(&result.stdout).trim().to_string();
    if path.is_empty() {
        return Err("No se obtuvo ruta del archivo temporal".into());
    }
    Ok(path)
}

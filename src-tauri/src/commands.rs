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
pub fn get_track_metadata(path: String, state: State<'_, AppState>) -> Result<TrackMetadata, String> {
    if let Some(track) = state.db.get_track_by_path(&path) {
        if track.duration_seconds > 0.0 {
            return Ok(track);
        }
    }
    let p = std::path::Path::new(&path);
    if let Some(track) = crate::db::extract_metadata(p) {
        let _ = state.db.upsert_track(&track);
        return Ok(track);
    }
    Err(format!("Could not extract metadata for {}", path))
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



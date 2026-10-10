pub mod audio;
pub mod commands;
pub mod db;
pub mod downloader;
pub mod fs_lazy;
pub mod models;
#[cfg(target_os = "linux")]
pub mod mpris;
pub mod radio_relay;
pub mod tagger;
pub mod ytdlp;
pub mod mpd;

use audio::AudioEngineHandle;
use commands::AppState;
use db::DatabaseManager;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK puede renderizar una ventana en blanco dentro de AppImage (libs Mesa/WebKit empaquetadas)
    // cuando usa el renderer DMABUF. Solo se desactiva en AppImage (o si MUSICX_DISABLE_DMABUF=1):
    // fuera de AppImage forzarlo obliga a copiar cada fotograma por CPU (calentamiento y lag).
    // NOTA: WEBKIT_DISABLE_COMPOSITING_MODE NO se debe activar porque desactiva la aceleración GPU
    // obligando a la CPU a renderizar todo por software (causando 100% CPU y calentamiento).
    #[cfg(target_os = "linux")]
    {
        let in_appimage = std::env::var_os("APPIMAGE").is_some();
        let forced = std::env::var_os("MUSICX_DISABLE_DMABUF").is_some();
        if (in_appimage || forced) && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    let audio_engine = Arc::new(AudioEngineHandle::new());

    #[cfg(target_os = "linux")]
    mpris::start_mpris_service(Arc::clone(&audio_engine));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup({
            let audio_engine = Arc::clone(&audio_engine);
            move |app| {
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| PathBuf::from("."));
                let _ = std::fs::create_dir_all(&app_data_dir);
                let db_path = app_data_dir.join("musicx_library.db");

                let db = DatabaseManager::new(db_path)
                    .expect("Failed to initialize SQLite database for musicx");
                let db = Arc::new(db);

                // Load cached mpd_config.json if available
                let mpd_cfg_path = app_data_dir.join("mpd_config.json");
                if mpd_cfg_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&mpd_cfg_path) {
                        if let Ok(cfg) = serde_json::from_str::<mpd::MpdConfig>(&content) {
                            audio_engine.set_mpd_config(Some(cfg));
                        }
                    }
                }

                app.manage(AppState {
                    audio: Arc::clone(&audio_engine),
                    db,
                    radio_relay: Arc::new(radio_relay::RadioRelayState::default()),
                });

                // Downloader state (cancel flag + running PIDs)
                app.manage(downloader::DownloaderState::default());

                tauri::async_runtime::spawn(async {
                    let _ = crate::ytdlp::ensure_runtime_deps().await;
                });

                // Real-time audio telemetry broadcaster (~33 FPS)
                let app_handle = app.handle().clone();
                let audio_for_telemetry = Arc::clone(&audio_engine);
                std::thread::Builder::new()
                    .name("musicx-telemetry-broadcaster".to_string())
                    .spawn(move || loop {
                        let tele = audio_for_telemetry.get_telemetry();
                        let playing = matches!(tele.state, models::PlaybackState::Playing);
                        let _ = app_handle.emit("audio-telemetry", &tele);
                        // 33 Hz reproduciendo; 4 Hz en reposo para no despertar el WebView sin motivo
                        std::thread::sleep(std::time::Duration::from_millis(if playing { 30 } else { 250 }));
                    })
                    .expect("Failed to spawn telemetry broadcaster thread");

                // Buffer telemetry broadcaster (10 Hz)
                let app_handle_buf = app.handle().clone();
                let audio_for_buffer = Arc::clone(&audio_engine);
                std::thread::Builder::new()
                    .name("musicx-buffer-telemetry-broadcaster".to_string())
                    .spawn(move || loop {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        let b_tele = audio_for_buffer.get_buffer_telemetry();
                        let _ = app_handle_buf.emit("buffer-telemetry", &b_tele);
                    })
                    .expect("Failed to spawn buffer telemetry broadcaster thread");

                if let Some(window) = app.get_webview_window("main") {
                    let ws_path = app_data_dir.join("window_state.json");
                    if let Ok(data) = std::fs::read_to_string(&ws_path) {
                        if let Ok(saved) = serde_json::from_str::<commands::SavedWindowState>(&data) {
                            if saved.is_maximized {
                                let _ = window.maximize();
                            } else if saved.width >= 300.0 && saved.height >= 200.0 {
                                let _ = window.set_size(tauri::LogicalSize::new(saved.width, saved.height));
                                if let (Some(x), Some(y)) = (saved.x, saved.y) {
                                    let _ = window.set_position(tauri::LogicalPosition::new(x, y));
                                }
                            }
                        }
                    }
                }

                Ok(())
            }
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                match event {
                    tauri::WindowEvent::Resized(size) => {
                        let is_max = window.is_maximized().unwrap_or(false);
                        if let Ok(scale_factor) = window.scale_factor() {
                            let logical_w = size.width as f64 / scale_factor;
                            let logical_h = size.height as f64 / scale_factor;
                            if logical_w >= 300.0 && logical_h >= 200.0 {
                                let app_handle = window.app_handle();
                                if let Ok(app_data_dir) = app_handle.path().app_data_dir() {
                                    let _ = std::fs::create_dir_all(&app_data_dir);
                                    let ws_path = app_data_dir.join("window_state.json");
                                    let mut current = std::fs::read_to_string(&ws_path)
                                        .ok()
                                        .and_then(|c| serde_json::from_str::<commands::SavedWindowState>(&c).ok())
                                        .unwrap_or(commands::SavedWindowState {
                                            width: logical_w,
                                            height: logical_h,
                                            x: None,
                                            y: None,
                                            is_maximized: is_max,
                                            is_mini_player: false,
                                        });
                                    current.is_maximized = is_max;
                                    if !is_max {
                                        current.width = logical_w;
                                        current.height = logical_h;
                                    }
                                    if let Ok(json) = serde_json::to_string_pretty(&current) {
                                        let _ = std::fs::write(ws_path, json);
                                    }
                                }
                            }
                        }
                    }
                    tauri::WindowEvent::Moved(pos) => {
                        let is_max = window.is_maximized().unwrap_or(false);
                        if !is_max {
                            if let Ok(scale_factor) = window.scale_factor() {
                                let logical_x = pos.x as f64 / scale_factor;
                                let logical_y = pos.y as f64 / scale_factor;
                                let app_handle = window.app_handle();
                                if let Ok(app_data_dir) = app_handle.path().app_data_dir() {
                                    let ws_path = app_data_dir.join("window_state.json");
                                    if let Some(mut current) = std::fs::read_to_string(&ws_path)
                                        .ok()
                                        .and_then(|c| serde_json::from_str::<commands::SavedWindowState>(&c).ok())
                                    {
                                        current.x = Some(logical_x);
                                        current.y = Some(logical_y);
                                        if let Ok(json) = serde_json::to_string_pretty(&current) {
                                            let _ = std::fs::write(ws_path, json);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_audio_engine_status,
            commands::get_telemetry,
            commands::get_buffer_telemetry,
            commands::set_audio_buffer_size,
            commands::reset_audio_xruns,
            commands::save_radio_recording,
            commands::write_text_file,
            commands::read_text_file,
            commands::start_radio_relay,
            commands::stop_radio_relay,
            commands::play_track,
            commands::pause_track,
            commands::resume_track,
            commands::stop_track,
            commands::seek_track,
            commands::set_volume,
            commands::set_output_device,
            commands::set_audio_engine,
            commands::set_dsp_settings,
            commands::list_audio_devices,
            commands::get_library_tracks,
            commands::scan_directory,
            commands::read_directory_lazy,
            commands::scan_folder_tracks_recursive,
            commands::get_track_cover_art,
            commands::get_track_metadata,
            commands::get_saved_window_state,
            commands::save_window_state,
            // ── Stream Music / Downloader (ported from Soundix) ──
            downloader::analyze_source_link,
            downloader::download_track_batch,
            downloader::cancel_download_batch,
            downloader::get_stream_audio_url,
            ytdlp::get_ytdlp_info,
            ytdlp::update_ytdlp,
            ytdlp::get_runtime_deps_status,
            ytdlp::install_or_update_runtime_deps,
            // ── ID3 Tag Editor & Cover Studio (ported and unified from Soundix) ──
            tagger::read_single_track_tags,
            tagger::read_folder_tracks,
            tagger::write_track_tags,
            tagger::batch_write_folder_tags,
            tagger::search_online_covers,
            tagger::load_image_data_url,
            tagger::generate_spectrogram,
            tagger::fetch_online_metadata,
            commands::frontend_log,
            // ── MPD (Music Player Daemon) Integration ──
            mpd::mpd_get_status,
            mpd::mpd_discover_servers,
            mpd::mpd_list_directory,
            mpd::mpd_send_command,
            mpd::mpd_compare_libraries,
            mpd::mpd_transfer_files,
            mpd::mpd_save_config,
            mpd::mpd_get_playlist_info,
            mpd::mpd_get_outputs,
            mpd::mpd_resolve_base_path,
            mpd::mpd_delete_item,
        ])
        .run(tauri::generate_context!())
        .expect("error while running musicx audio player application");
}

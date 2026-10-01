pub mod audio;
pub mod commands;
pub mod db;
pub mod downloader;
pub mod fs_lazy;
pub mod models;
#[cfg(target_os = "linux")]
pub mod mpris;
pub mod radio_relay;
pub mod ytdlp;

use audio::AudioEngineHandle;
use commands::AppState;
use db::DatabaseManager;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

                app.manage(AppState {
                    audio: Arc::clone(&audio_engine),
                    db,
                    radio_relay: Arc::new(radio_relay::RadioRelayState::default()),
                });

                // Downloader state (cancel flag + running PIDs)
                app.manage(downloader::DownloaderState::default());

                // Real-time audio telemetry broadcaster (~33 FPS)
                let app_handle = app.handle().clone();
                let audio_for_telemetry = Arc::clone(&audio_engine);
                std::thread::Builder::new()
                    .name("musicx-telemetry-broadcaster".to_string())
                    .spawn(move || loop {
                        std::thread::sleep(std::time::Duration::from_millis(30));
                        let tele = audio_for_telemetry.get_telemetry();
                        let _ = app_handle.emit("audio-telemetry", &tele);
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

                Ok(())
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
            commands::set_dsp_settings,
            commands::list_audio_devices,
            commands::get_library_tracks,
            commands::scan_directory,
            commands::read_directory_lazy,
            commands::get_track_cover_art,
            // ── Stream Music / Downloader (ported from Soundix) ──
            downloader::analyze_source_link,
            downloader::download_track_batch,
            downloader::cancel_download_batch,
            downloader::get_stream_audio_url,
            ytdlp::get_ytdlp_info,
            ytdlp::update_ytdlp,
            ytdlp::get_runtime_deps_status,
            ytdlp::install_or_update_runtime_deps,
        ])
        .run(tauri::generate_context!())
        .expect("error while running musicx audio player application");
}

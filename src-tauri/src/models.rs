use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackMetadata {
    pub id: Option<i64>,
    pub filepath: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub track_number: Option<u32>,
    pub duration_seconds: f64,
    pub format: String,
    pub sample_rate: u32,
    pub bit_depth: u16,
    pub bitrate_kbps: u32,
    pub file_size: u64,
    pub mtime: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlaybackState {
    Playing,
    Paused,
    Stopped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioTelemetry {
    pub state: PlaybackState,
    pub current_position_secs: f64,
    pub duration_secs: f64,
    pub sample_rate: u32,
    pub bit_depth: u16,
    pub channels: u16,
    pub bitrate_kbps: u32,
    pub volume: f32,
    pub bit_perfect: bool,
    pub output_device: String,
    pub track_title: Option<String>,
    pub track_artist: Option<String>,
    pub track_album: Option<String>,
    pub filepath: Option<String>,
    pub spectrum: Vec<f32>,
    pub spectrum_left: Vec<f32>,
    pub spectrum_right: Vec<f32>,
    pub seekbar_spectrum: Vec<f32>,
    pub tempo_bpm: Option<f32>,
    pub tempo_confidence: f32,
}

impl Default for AudioTelemetry {
    fn default() -> Self {
        Self {
            state: PlaybackState::Stopped,
            current_position_secs: 0.0,
            duration_secs: 0.0,
            sample_rate: 44100,
            bit_depth: 16,
            channels: 2,
            bitrate_kbps: 1411,
            volume: 1.0,
            bit_perfect: true,
            output_device: "ALSA (Bit-Perfect Direct)".to_string(),
            track_title: None,
            track_artist: None,
            track_album: None,
            filepath: None,
            spectrum: vec![0.0; 64],
            spectrum_left: vec![0.0; 64],
            spectrum_right: vec![0.0; 64],
            seekbar_spectrum: Vec::new(),
            tempo_bpm: None,
            tempo_confidence: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub scanned_files: usize,
    pub total_files: usize,
    pub current_path: String,
    pub is_finished: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BufferTelemetry {
    pub buffer_capacity_frames: usize,
    pub buffer_fill_frames: usize,
    pub buffer_fill_percent: f32,
    pub hardware_buffer_frames: u32,
    pub sample_rate: u32,
    pub channels: u16,
    pub latency_ms: f64,
    pub underruns: u64,
    pub overruns: u64,
    pub total_xruns: u64,
    pub io_read_time_ms: f64,
    pub is_network_mount: bool,
    pub is_active: bool,
}

impl Default for BufferTelemetry {
    fn default() -> Self {
        Self {
            buffer_capacity_frames: 88200,
            buffer_fill_frames: 0,
            buffer_fill_percent: 0.0,
            hardware_buffer_frames: 256,
            sample_rate: 44100,
            channels: 2,
            latency_ms: 5.80,
            underruns: 0,
            overruns: 0,
            total_xruns: 0,
            io_read_time_ms: 0.0,
            is_network_mount: false,
            is_active: false,
        }
    }
}

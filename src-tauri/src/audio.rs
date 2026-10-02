use crate::models::{AudioTelemetry, BufferTelemetry, PlaybackState};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Stream, StreamConfig};
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::collections::VecDeque;
use std::fs::File;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{Decoder, DecoderOptions};
use symphonia::core::conv::FromSample;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::Time;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DspSettings {
    pub is_eq_enabled: bool,
    pub eq_gains: Vec<f32>,
    pub is_normalizer_enabled: bool,
    pub is_xdss_enabled: bool,
    pub tube_warmth: bool,
}

impl Default for DspSettings {
    fn default() -> Self {
        Self {
            is_eq_enabled: false,
            eq_gains: vec![0.0; 10],
            is_normalizer_enabled: true,
            is_xdss_enabled: false,
            tube_warmth: false,
        }
    }
}

pub enum AudioCommand {
    PlayTrack { path: String, bit_perfect: bool, device_name: Option<String> },
    EnqueueTrack { path: String },
    Play,
    Pause,
    Stop,
    Seek(f64),
    SetVolume(f32),
    SetOutputDevice { device_name: Option<String>, bit_perfect: bool },
    SetDspSettings(DspSettings),
    SetBufferSize(u32),
    ResetXruns,
}

pub struct AudioEngineHandle {
    sender: Sender<AudioCommand>,
    telemetry: Arc<Mutex<AudioTelemetry>>,
    buffer_telemetry: Arc<Mutex<BufferTelemetry>>,
    requested_buffer_frames: Arc<AtomicU32>,
    #[allow(dead_code)]
    actual_buffer_frames: Arc<AtomicU32>,
}

impl AudioEngineHandle {
    pub fn new() -> Self {
        let (sender, receiver) = channel();
        let telemetry = Arc::new(Mutex::new(AudioTelemetry::default()));
        let buffer_telemetry = Arc::new(Mutex::new(BufferTelemetry::default()));
        let requested_buffer_frames = Arc::new(AtomicU32::new(512));
        let actual_buffer_frames = Arc::new(AtomicU32::new(512));

        let telemetry_clone = Arc::clone(&telemetry);
        let buffer_telemetry_clone = Arc::clone(&buffer_telemetry);
        let req_bf_clone = Arc::clone(&requested_buffer_frames);
        let act_bf_clone = Arc::clone(&actual_buffer_frames);

        thread::Builder::new()
            .name("musicx-audio-core".to_string())
            .spawn(move || {
                let mut engine = AudioEngineInternal::new(
                    receiver,
                    telemetry_clone,
                    buffer_telemetry_clone,
                    req_bf_clone,
                    act_bf_clone,
                );
                engine.run();
            })
            .expect("Failed to spawn audio core thread");

        Self {
            sender,
            telemetry,
            buffer_telemetry,
            requested_buffer_frames,
            actual_buffer_frames,
        }
    }

    pub fn send(&self, cmd: AudioCommand) {
        let _ = self.sender.send(cmd);
    }

    pub fn get_telemetry(&self) -> AudioTelemetry {
        self.telemetry.lock().unwrap().clone()
    }

    pub fn get_buffer_telemetry(&self) -> BufferTelemetry {
        self.buffer_telemetry.lock().unwrap().clone()
    }

    pub fn set_buffer_size(&self, frames: u32) -> Result<u32, String> {
        let clamped = match frames {
            0..=95 => 64,
            96..=191 => 128,
            192..=383 => 256,
            384..=767 => 512,
            _ => 1024,
        };
        self.requested_buffer_frames.store(clamped, Ordering::Relaxed);
        self.actual_buffer_frames.store(clamped, Ordering::Relaxed);
        {
            let mut bt = self.buffer_telemetry.lock().unwrap();
            bt.hardware_buffer_frames = clamped;
            let sr = bt.sample_rate.max(44100);
            bt.latency_ms = ((clamped as f64 / sr as f64) * 1000.0 * 100.0).round() / 100.0;
        }
        let _ = self.sender.send(AudioCommand::SetBufferSize(clamped));
        Ok(clamped)
    }

    pub fn reset_xruns(&self) {
        let _ = self.sender.send(AudioCommand::ResetXruns);
    }
}

#[allow(dead_code)]
struct AudioSource {
    reader: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    sample_rate: u32,
    bit_depth: u16,
    channels: u16,
    duration_secs: f64,
    pub file_path: String,
    title: String,
    artist: String,
    album: String,
    file_size: u64,
}

impl AudioSource {
    fn open(path_str: &str) -> Result<Self, String> {
        let path = Path::new(path_str);
        let file = File::open(path).map_err(|e| e.to_string())?;
        let meta = file.metadata().map_err(|e| e.to_string())?;
        let file_size = meta.len();

        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        let mut hint = Hint::new();
        hint.with_extension(&ext);

        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        let format_opts = FormatOptions {
            enable_gapless: true,
            ..Default::default()
        };
        let metadata_opts = MetadataOptions::default();

        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &format_opts, &metadata_opts)
            .map_err(|e| e.to_string())?;

        let reader = probed.format;
        let track = reader.default_track().ok_or_else(|| "No audio track found".to_string())?;
        let track_id = track.id;
        let params = track.codec_params.clone();

        let sample_rate = params.sample_rate.unwrap_or(44_100);
        let bit_depth = params.bits_per_sample.unwrap_or(16) as u16;
        let channels = params.channels.map(|c| c.count() as u16).unwrap_or(2);

        let duration_secs = if let (Some(n_frames), Some(time_base)) = (params.n_frames, params.time_base) {
            let t = time_base.calc_time(n_frames);
            t.seconds as f64 + t.frac
        } else {
            0.0
        };

        let decoder_opts = DecoderOptions {
            verify: false,
        };
        let decoder = symphonia::default::get_codecs()
            .make(&params, &decoder_opts)
            .map_err(|e| e.to_string())?;

        let title = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Pista").to_string();

        Ok(Self {
            reader,
            decoder,
            track_id,
            sample_rate,
            bit_depth,
            channels,
            duration_secs,
            file_path: path_str.to_string(),
            title,
            artist: "Desconocido".to_string(),
            album: "Desconocido".to_string(),
            file_size,
        })
    }
}

fn is_network_path(path_str: &str) -> bool {
    let lower = path_str.to_lowercase();
    if lower.starts_with("/mnt/")
        || lower.starts_with("/media/")
        || lower.starts_with("/net/")
        || lower.starts_with("/run/user/")
        || lower.contains("smb-share")
        || lower.contains("gvfs")
        || lower.starts_with("//")
        || lower.starts_with(r"\\")
    {
        return true;
    }
    // Check /proc/mounts on Linux if available
    if let Ok(mounts) = std::fs::read_to_string("/proc/mounts") {
        for line in mounts.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let mount_point = parts[1];
                let fs_type = parts[2];
                if path_str.starts_with(mount_point) {
                    if matches!(fs_type, "nfs" | "nfs4" | "cifs" | "smbfs" | "fuse.sshfs" | "davfs") {
                        return true;
                    }
                }
            }
        }
    }
    false
}

struct AudioEngineInternal {
    receiver: Receiver<AudioCommand>,
    telemetry: Arc<Mutex<AudioTelemetry>>,
    buffer_telemetry: Arc<Mutex<BufferTelemetry>>,
    requested_buffer_frames: Arc<AtomicU32>,
    actual_buffer_frames: Arc<AtomicU32>,
    underruns_count: Arc<AtomicU64>,
    overruns_count: Arc<AtomicU64>,
    last_io_read_time_ms: f64,
    is_network_mount: bool,
    current_source: Option<AudioSource>,
    queue: VecDeque<String>,
    pcm_buffer: Arc<Mutex<VecDeque<f32>>>,
    cpal_stream: Option<Stream>,
    output_device_name: Option<String>,
    bit_perfect: bool,
    volume: Arc<Mutex<f32>>,
    is_playing: Arc<AtomicBool>,
    active_sample_rate: u32,
    active_channels: u16,
    samples_rendered: Arc<AtomicU32>,
    current_pos_secs: f64,
    dsp_settings: Arc<Mutex<DspSettings>>,
    spectrum_fft: Arc<dyn Fft<f32>>,
    tempo_detector: TempoDetector,
}

impl AudioEngineInternal {
    fn new(
        receiver: Receiver<AudioCommand>,
        telemetry: Arc<Mutex<AudioTelemetry>>,
        buffer_telemetry: Arc<Mutex<BufferTelemetry>>,
        requested_buffer_frames: Arc<AtomicU32>,
        actual_buffer_frames: Arc<AtomicU32>,
    ) -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let spectrum_fft = planner.plan_fft_forward(1024);
        let tempo_detector = TempoDetector::new();
        Self {
            receiver,
            telemetry,
            buffer_telemetry,
            requested_buffer_frames,
            actual_buffer_frames,
            underruns_count: Arc::new(AtomicU64::new(0)),
            overruns_count: Arc::new(AtomicU64::new(0)),
            last_io_read_time_ms: 0.0,
            is_network_mount: false,
            current_source: None,
            queue: VecDeque::new(),
            pcm_buffer: Arc::new(Mutex::new(VecDeque::with_capacity(96_000 * 2))),
            cpal_stream: None,
            output_device_name: None,
            bit_perfect: true,
            volume: Arc::new(Mutex::new(1.0)),
            is_playing: Arc::new(AtomicBool::new(false)),
            active_sample_rate: 44_100,
            active_channels: 2,
            samples_rendered: Arc::new(AtomicU32::new(0)),
            current_pos_secs: 0.0,
            dsp_settings: Arc::new(Mutex::new(DspSettings::default())),
            spectrum_fft,
            tempo_detector,
        }
    }

    fn run(&mut self) {
        loop {
            // Process commands non-blocking
            while let Ok(cmd) = self.receiver.try_recv() {
                self.handle_command(cmd);
            }

            let playing = self.is_playing.load(Ordering::Relaxed);

            if playing {
                // Keep PCM buffer filled (aim for at least 1-2 seconds of decoded audio)
                let buffer_len = self.pcm_buffer.lock().unwrap().len();
                let target_capacity = (self.active_sample_rate as usize * self.active_channels as usize) * 2;

                if buffer_len < target_capacity {
                    self.decode_next_packet();
                }

                // Update playhead telemetry
                let rendered = self.samples_rendered.swap(0, Ordering::Relaxed);
                if rendered > 0 && self.active_sample_rate > 0 && self.active_channels > 0 {
                    let delta_sec = (rendered as f64) / (self.active_sample_rate as f64 * self.active_channels as f64);
                    self.current_pos_secs += delta_sec;
                }
            }

            self.update_telemetry();
            thread::sleep(Duration::from_millis(15));
        }
    }

    fn handle_command(&mut self, cmd: AudioCommand) {
        match cmd {
            AudioCommand::PlayTrack { path, bit_perfect, device_name } => {
                self.bit_perfect = bit_perfect;
                self.output_device_name = device_name;
                self.start_track(&path);
            }
            AudioCommand::EnqueueTrack { path } => {
                self.queue.push_back(path);
            }
            AudioCommand::Play => {
                self.is_playing.store(true, Ordering::Relaxed);
            }
            AudioCommand::Pause => {
                self.is_playing.store(false, Ordering::Relaxed);
            }
            AudioCommand::Stop => {
                self.is_playing.store(false, Ordering::Relaxed);
                self.pcm_buffer.lock().unwrap().clear();
                self.current_pos_secs = 0.0;
                self.current_source = None;
                self.tempo_detector.reset();
                self.telemetry.lock().unwrap().seekbar_spectrum.clear();
            }
            AudioCommand::Seek(target_secs) => {
                self.seek_to(target_secs);
            }
            AudioCommand::SetVolume(vol) => {
                let clamped = vol.clamp(0.0, 1.5);
                *self.volume.lock().unwrap() = clamped;
            }
            AudioCommand::SetOutputDevice { device_name, bit_perfect } => {
                self.output_device_name = device_name;
                self.bit_perfect = bit_perfect;
                // Re-initialize device stream if already playing
                if self.is_playing.load(Ordering::Relaxed) {
                    self.setup_cpal_stream();
                }
            }
            AudioCommand::SetDspSettings(settings) => {
                *self.dsp_settings.lock().unwrap() = settings;
            }
            AudioCommand::SetBufferSize(frames) => {
                self.requested_buffer_frames.store(frames, Ordering::Relaxed);
                self.actual_buffer_frames.store(frames, Ordering::Relaxed);
                if self.cpal_stream.is_some() {
                    self.setup_cpal_stream();
                }
                self.update_telemetry();
            }
            AudioCommand::ResetXruns => {
                self.underruns_count.store(0, Ordering::Relaxed);
                self.overruns_count.store(0, Ordering::Relaxed);
            }
        }
    }

    fn start_track(&mut self, path: &str) {
        self.is_network_mount = is_network_path(path);
        match AudioSource::open(path) {
            Ok(source) => {
                let sr = source.sample_rate;
                let ch = source.channels;
                self.current_source = Some(source);
                self.current_pos_secs = 0.0;
                self.pcm_buffer.lock().unwrap().clear();
                self.tempo_detector.reset();

                let track_path = path.to_string();
                {
                    let mut telemetry = self.telemetry.lock().unwrap();
                    telemetry.filepath = Some(track_path.clone());
                    telemetry.seekbar_spectrum.clear();
                }
                let waveform_telemetry = Arc::clone(&self.telemetry);
                let _ = thread::Builder::new()
                    .name("musicx-seekbar-analysis".to_string())
                    .spawn(move || {
                        let waveform = analyze_track_waveform(&track_path);
                        if waveform.is_empty() {
                            return;
                        }
                        let mut telemetry = waveform_telemetry.lock().unwrap();
                        if telemetry.filepath.as_deref() == Some(track_path.as_str()) {
                            telemetry.seekbar_spectrum = waveform;
                        }
                    });

                // Reconfigure CPAL stream if sample rate or channel configuration changed
                if self.cpal_stream.is_none() || self.active_sample_rate != sr || self.active_channels != ch {
                    self.active_sample_rate = sr;
                    self.active_channels = ch;
                    self.setup_cpal_stream();
                }

                self.is_playing.store(true, Ordering::Relaxed);
            }
            Err(e) => {
                eprintln!("[musicx audio core] Error al abrir archivo {}: {}", path, e);
            }
        }
    }

    fn seek_to(&mut self, target_secs: f64) {
        if let Some(ref mut source) = self.current_source {
            let seek_time = Time::from(target_secs);
            if let Ok(_) = source.reader.seek(
                SeekMode::Coarse,
                SeekTo::Time {
                    time: seek_time,
                    track_id: Some(source.track_id),
                },
            ) {
                let _ = source.decoder.reset();
                self.pcm_buffer.lock().unwrap().clear();
                self.current_pos_secs = target_secs;
                self.tempo_detector.reset();
            }
        }
    }

    fn decode_next_packet(&mut self) {
        let (next_track, finished) = if let Some(ref mut source) = self.current_source {
            let io_start = Instant::now();
            let packet_result = source.reader.next_packet();
            let elapsed_ms = io_start.elapsed().as_secs_f64() * 1000.0;
            self.last_io_read_time_ms = elapsed_ms;

            match packet_result {
                Ok(packet) => {
                    if packet.track_id() == source.track_id {
                        if let Ok(decoded) = source.decoder.decode(&packet) {
                            Self::convert_and_push(&decoded, &self.pcm_buffer, &self.overruns_count);
                        }
                    }
                    (None, false)
                }
                Err(_) => {
                    // Current track reached EOF. Check gapless queue
                    (self.queue.pop_front(), true)
                }
            }
        } else {
            (self.queue.pop_front(), false)
        };

        if finished {
            if let Some(next_path) = next_track {
                // Gapless transition: instantly open next track into the stream
                let _ = self.start_track(&next_path);
            } else {
                // Wait for buffer to drain
                if self.pcm_buffer.lock().unwrap().is_empty() {
                    self.is_playing.store(false, Ordering::Relaxed);
                }
            }
        }
    }

    fn convert_and_push(decoded: &AudioBufferRef, buffer: &Arc<Mutex<VecDeque<f32>>>, overruns_counter: &Arc<AtomicU64>) {
        let mut target = buffer.lock().unwrap();
        let max_capacity = 96_000 * 4; // Max ~2-4s of samples

        let mut samples_to_push = Vec::new();
        match decoded {
            AudioBufferRef::F32(buf) => {
                let num_planes = buf.planes().planes().len();
                let num_frames = buf.frames();
                if num_planes == 1 {
                    samples_to_push.extend_from_slice(buf.chan(0));
                } else if num_planes >= 2 {
                    let left = buf.chan(0);
                    let right = buf.chan(1);
                    for i in 0..num_frames {
                        samples_to_push.push(left[i]);
                        samples_to_push.push(right[i]);
                    }
                }
            }
            AudioBufferRef::S16(buf) => {
                let num_planes = buf.planes().planes().len();
                let num_frames = buf.frames();
                if num_planes == 1 {
                    for &s in buf.chan(0) {
                        samples_to_push.push(f32::from_sample(s));
                    }
                } else if num_planes >= 2 {
                    let left = buf.chan(0);
                    let right = buf.chan(1);
                    for i in 0..num_frames {
                        samples_to_push.push(f32::from_sample(left[i]));
                        samples_to_push.push(f32::from_sample(right[i]));
                    }
                }
            }
            AudioBufferRef::S24(buf) => {
                let num_planes = buf.planes().planes().len();
                let num_frames = buf.frames();
                if num_planes == 1 {
                    for &s in buf.chan(0) {
                        samples_to_push.push(f32::from_sample(s));
                    }
                } else if num_planes >= 2 {
                    let left = buf.chan(0);
                    let right = buf.chan(1);
                    for i in 0..num_frames {
                        samples_to_push.push(f32::from_sample(left[i]));
                        samples_to_push.push(f32::from_sample(right[i]));
                    }
                }
            }
            AudioBufferRef::S32(buf) => {
                let num_planes = buf.planes().planes().len();
                let num_frames = buf.frames();
                if num_planes == 1 {
                    for &s in buf.chan(0) {
                        samples_to_push.push(f32::from_sample(s));
                    }
                } else if num_planes >= 2 {
                    let left = buf.chan(0);
                    let right = buf.chan(1);
                    for i in 0..num_frames {
                        samples_to_push.push(f32::from_sample(left[i]));
                        samples_to_push.push(f32::from_sample(right[i]));
                    }
                }
            }
            AudioBufferRef::U8(buf) => {
                for &s in buf.chan(0) {
                    samples_to_push.push(f32::from_sample(s));
                }
            }
            _ => {}
        }

        if target.len() + samples_to_push.len() > max_capacity {
            overruns_counter.fetch_add(1, Ordering::Relaxed);
            let drop_count = (target.len() + samples_to_push.len()) - max_capacity;
            for _ in 0..drop_count.min(target.len()) {
                target.pop_front();
            }
        }
        for s in samples_to_push {
            target.push_back(s);
        }
    }

    fn setup_cpal_stream(&mut self) {
        let host = cpal::default_host();

        let device = if let Some(ref dev_name) = self.output_device_name {
            host.output_devices()
                .ok()
                .and_then(|mut devs| devs.find(|d| d.name().map(|n| n == *dev_name).unwrap_or(false)))
                .or_else(|| host.default_output_device())
        } else {
            host.default_output_device()
        };

        let device = match device {
            Some(d) => d,
            None => {
                eprintln!("[musicx audio core] No audio output device available");
                return;
            }
        };

        let req_frames = self.requested_buffer_frames.load(Ordering::Relaxed);
        let config = StreamConfig {
            channels: self.active_channels,
            sample_rate: cpal::SampleRate(self.active_sample_rate),
            buffer_size: cpal::BufferSize::Fixed(req_frames),
        };

        let pcm_buffer_clone = Arc::clone(&self.pcm_buffer);
        let volume_clone = Arc::clone(&self.volume);
        let is_playing_clone = Arc::clone(&self.is_playing);
        let samples_counter = Arc::clone(&self.samples_rendered);
        let dsp_settings_clone = Arc::clone(&self.dsp_settings);
        let underruns_counter = Arc::clone(&self.underruns_count);

        let err_fn = |err| eprintln!("[musicx cpal stream error]: {}", err);

        let callback = move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
            let playing = is_playing_clone.load(Ordering::Relaxed);
            let vol = *volume_clone.lock().unwrap();
            let dsp = dsp_settings_clone.lock().unwrap().clone();

            if !playing {
                for sample in data.iter_mut() {
                    *sample = 0.0;
                }
                return;
            }

            let mut buf = pcm_buffer_clone.lock().unwrap();
            let mut rendered = 0;
            let mut had_underrun = false;

            for sample in data.iter_mut() {
                if let Some(val) = buf.pop_front() {
                    let mut s = val * vol;

                    // 1. XDSS Dynamic Bass Harmonic Enhancement
                    if dsp.is_xdss_enabled {
                        let bass_drive = (s * 1.8).tanh() * 0.28;
                        s += bass_drive;
                    }

                    // 2. Tube Warmth
                    if dsp.tube_warmth {
                        s = s * 1.05 - 0.05 * s * s * s;
                    }

                    // 3. Soundix True-Peak Normalizer & Soft Limiter (-0.1 dBTP)
                    if dsp.is_normalizer_enabled {
                        if s > 0.988 {
                            s = 0.988 + (s - 0.988).tanh() * 0.01;
                        } else if s < -0.988 {
                            s = -0.988 + (s + 0.988).tanh() * 0.01;
                        }
                    }

                    *sample = s;
                    rendered += 1;
                } else {
                    *sample = 0.0;
                    had_underrun = true;
                }
            }

            if had_underrun {
                underruns_counter.fetch_add(1, Ordering::Relaxed);
            }

            samples_counter.fetch_add(rendered, Ordering::Relaxed);
        };

        // Try fixed buffer size first; if unsupported by hardware, fallback to Default
        let stream_result = device.build_output_stream(&config, callback.clone(), err_fn, None).or_else(|_| {
            let default_config = StreamConfig {
                channels: self.active_channels,
                sample_rate: cpal::SampleRate(self.active_sample_rate),
                buffer_size: cpal::BufferSize::Default,
            };
            device.build_output_stream(&default_config, callback, err_fn, None)
        });

        match stream_result {
            Ok(stream) => {
                let _ = stream.play();
                self.cpal_stream = Some(stream);
                self.actual_buffer_frames.store(req_frames, Ordering::Relaxed);
                self.update_telemetry();
            }
            Err(e) => {
                eprintln!("[musicx audio core] Fallo al crear stream CPAL: {}", e);
            }
        }
    }

    fn update_telemetry(&mut self) {
        let is_playing = self.is_playing.load(Ordering::Relaxed);
        let mut tele = self.telemetry.lock().unwrap();

        tele.state = if is_playing {
            PlaybackState::Playing
        } else if self.current_source.is_some() && self.current_pos_secs > 0.0 {
            PlaybackState::Paused
        } else {
            PlaybackState::Stopped
        };

        tele.current_position_secs = self.current_pos_secs;
        tele.volume = *self.volume.lock().unwrap();
        tele.bit_perfect = self.bit_perfect;
        tele.output_device = self
            .output_device_name
            .clone()
            .unwrap_or_else(|| "System Default (PipeWire/ALSA)".to_string());

        let (left_frame, right_frame, mono_frame) = {
            let buffer_lock = self.pcm_buffer.lock().unwrap();
            let channel_count = (self.active_channels as usize).max(1);
            let interleaved = buffer_lock
                .iter()
                .take(1024 * channel_count)
                .copied()
                .collect::<Vec<_>>();
            let mut left = Vec::with_capacity(1024);
            let mut right = Vec::with_capacity(1024);
            let mut mono = Vec::with_capacity(1024);
            for frame in interleaved.chunks(channel_count) {
                let left_sample = frame.first().copied().unwrap_or_default();
                let right_sample = frame.get(1).copied().unwrap_or(left_sample);
                left.push(left_sample);
                right.push(right_sample);
                mono.push((left_sample + right_sample) * 0.5);
            }
            (left, right, mono)
        };
        let tempo_frame = {
            let buffer_lock = self.pcm_buffer.lock().unwrap();
            buffer_lock
                .iter()
                .take(2048 * self.active_channels as usize)
                .copied()
                .collect::<Vec<_>>()
        };
        if is_playing {
            tele.spectrum_left = calculate_spectrum(&left_frame, self.spectrum_fft.as_ref());
            tele.spectrum_right = calculate_spectrum(&right_frame, self.spectrum_fft.as_ref());
            tele.spectrum = calculate_spectrum(&mono_frame, self.spectrum_fft.as_ref());
        } else {
            tele.spectrum_left = vec![0.0; 64];
            tele.spectrum_right = vec![0.0; 64];
            tele.spectrum = vec![0.0; 64];
        }
        if is_playing {
            self.tempo_detector
                .update(&tempo_frame, self.active_channels as usize);
        }
        tele.tempo_bpm = self.tempo_detector.bpm;
        tele.tempo_confidence = self.tempo_detector.confidence;

        if let Some(ref src) = self.current_source {
            tele.sample_rate = src.sample_rate;
            tele.bit_depth = src.bit_depth;
            tele.channels = src.channels;
            tele.duration_secs = src.duration_secs;
            tele.bitrate_kbps = if src.duration_secs > 0.0 {
                ((src.file_size as f64 * 8.0) / (src.duration_secs * 1000.0)).round() as u32
            } else {
                0
            };
            tele.track_title = Some(src.title.clone());
            tele.track_artist = Some(src.artist.clone());
            tele.track_album = Some(src.album.clone());
            tele.filepath = Some(src.file_path.clone());
        }

        // Update buffer telemetry
        let (buf_frames, buf_cap_frames) = {
            let buf_lock = self.pcm_buffer.lock().unwrap();
            let ch = (self.active_channels as usize).max(1);
            let frames = buf_lock.len() / ch;
            let cap_frames = buf_lock.capacity() / ch;
            (frames, cap_frames.max(1))
        };
        let hw_frames = self.actual_buffer_frames.load(Ordering::Relaxed).max(self.requested_buffer_frames.load(Ordering::Relaxed));
        let sr = self.active_sample_rate.max(1);
        let latency_ms = (hw_frames as f64 / sr as f64) * 1000.0;
        let underruns = self.underruns_count.load(Ordering::Relaxed);
        let overruns = self.overruns_count.load(Ordering::Relaxed);
        let fill_percent = ((buf_frames as f64 / buf_cap_frames as f64) * 100.0).clamp(0.0, 100.0) as f32;

        let mut b_tele = self.buffer_telemetry.lock().unwrap();
        b_tele.buffer_capacity_frames = buf_cap_frames;
        b_tele.buffer_fill_frames = buf_frames;
        b_tele.buffer_fill_percent = fill_percent;
        b_tele.hardware_buffer_frames = hw_frames;
        b_tele.sample_rate = self.active_sample_rate;
        b_tele.channels = self.active_channels;
        b_tele.latency_ms = (latency_ms * 1000.0).round() / 1000.0;
        b_tele.underruns = underruns;
        b_tele.overruns = overruns;
        b_tele.total_xruns = underruns + overruns;
        b_tele.io_read_time_ms = (self.last_io_read_time_ms * 1000.0).round() / 1000.0;
        b_tele.is_network_mount = self.is_network_mount;
        b_tele.is_active = is_playing;
    }
}

struct TempoDetector {
    fft: Arc<dyn Fft<f32>>,
    previous_bins: Vec<f32>,
    onset_history: VecDeque<f32>,
    updates_since_frame: u8,
    bpm: Option<f32>,
    confidence: f32,
}

impl TempoDetector {
    const FFT_SIZE: usize = 2048;
    const UPDATE_EVERY: u8 = 5;
    const MAX_HISTORY: usize = 192;

    fn new() -> Self {
        let mut planner = FftPlanner::<f32>::new();
        Self {
            fft: planner.plan_fft_forward(Self::FFT_SIZE),
            previous_bins: vec![0.0; Self::FFT_SIZE / 2],
            onset_history: VecDeque::with_capacity(Self::MAX_HISTORY),
            updates_since_frame: 0,
            bpm: None,
            confidence: 0.0,
        }
    }

    fn reset(&mut self) {
        self.previous_bins.fill(0.0);
        self.onset_history.clear();
        self.updates_since_frame = 0;
        self.bpm = None;
        self.confidence = 0.0;
    }

    fn update(&mut self, interleaved_samples: &[f32], channels: usize) {
        self.updates_since_frame += 1;
        if self.updates_since_frame < Self::UPDATE_EVERY {
            return;
        }
        self.updates_since_frame = 0;

        if channels == 0 || interleaved_samples.len() < Self::FFT_SIZE * channels {
            return;
        }

        let mut frame = vec![Complex::new(0.0f32, 0.0f32); Self::FFT_SIZE];
        for (index, samples) in interleaved_samples
            .chunks_exact(channels)
            .take(Self::FFT_SIZE)
            .enumerate()
        {
            let mono = samples.iter().sum::<f32>() / channels as f32;
            let window = 0.5
                - 0.5
                    * (std::f32::consts::TAU * index as f32 / (Self::FFT_SIZE - 1) as f32)
                        .cos();
            frame[index].re = mono * window;
        }
        self.fft.process(&mut frame);

        let mut flux = 0.0;
        for (index, previous) in self.previous_bins.iter_mut().enumerate().skip(2).take(40) {
            let magnitude = (frame[index].norm() / Self::FFT_SIZE as f32).ln_1p();
            flux += (magnitude - *previous).max(0.0);
            *previous = magnitude;
        }
        self.onset_history.push_back(flux);
        if self.onset_history.len() > Self::MAX_HISTORY {
            self.onset_history.pop_front();
        }

        let onsets = self.onset_history.iter().copied().collect::<Vec<_>>();
        if let (Some(bpm), confidence) = estimate_tempo(&onsets) {
            if confidence >= 0.12 {
                self.bpm = Some(match self.bpm {
                    Some(previous) if previous.min(bpm) / previous.max(bpm) > 0.9 => {
                        previous * 0.8 + bpm * 0.2
                    }
                    _ => bpm,
                });
                self.confidence = confidence;
            }
        }
    }
}

fn estimate_tempo(onsets: &[f32]) -> (Option<f32>, f32) {
    const FEATURE_RATE_HZ: f32 = 1.0 / 0.075;
    const MIN_BPM: f32 = 40.0;
    const MAX_BPM: f32 = 200.0;

    if onsets.len() < 64 {
        return (None, 0.0);
    }

    let mean = onsets.iter().sum::<f32>() / onsets.len() as f32;
    let min_lag = (FEATURE_RATE_HZ * 60.0 / MAX_BPM).round() as usize;
    let max_lag = (FEATURE_RATE_HZ * 60.0 / MIN_BPM).round() as usize;
    let mut best = (0.0f32, 0usize);

    for lag in min_lag..=max_lag.min(onsets.len() / 3) {
        let paired = onsets.len() - lag;
        let mut product = 0.0;
        let mut left_energy = 0.0;
        let mut right_energy = 0.0;
        for index in 0..paired {
            let left = onsets[index] - mean;
            let right = onsets[index + lag] - mean;
            product += left * right;
            left_energy += left * left;
            right_energy += right * right;
        }
        let score = if left_energy > 0.0 && right_energy > 0.0 {
            product / (left_energy * right_energy).sqrt()
        } else {
            0.0
        };
        if score > best.0 {
            best = (score, lag);
        }
    }

    if best.1 == 0 || best.0 <= 0.0 {
        (None, 0.0)
    } else {
        (Some(FEATURE_RATE_HZ * 60.0 / best.1 as f32), best.0)
    }
}

const SEEKBAR_SPECTRUM_BINS: usize = 384;

fn analyze_track_waveform(path: &str) -> Vec<f32> {
    let mut source = match AudioSource::open(path) {
        Ok(source) if source.duration_secs > 0.0 && source.sample_rate > 0 => source,
        _ => return Vec::new(),
    };
    let channels = usize::from(source.channels).clamp(1, 2);
    let expected_frames = (source.duration_secs * f64::from(source.sample_rate)).round() as u64;
    if expected_frames == 0 {
        return Vec::new();
    }

    let sample_buffer = Arc::new(Mutex::new(VecDeque::new()));
    let overruns = Arc::new(AtomicU64::new(0));
    let mut squared_energy = vec![0.0f64; SEEKBAR_SPECTRUM_BINS];
    let mut frame_counts = vec![0u64; SEEKBAR_SPECTRUM_BINS];
    let mut processed_frames = 0u64;

    while let Ok(packet) = source.reader.next_packet() {
        if packet.track_id() != source.track_id {
            continue;
        }
        let decoded = match source.decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(_) => continue,
        };
        AudioEngineInternal::convert_and_push(&decoded, &sample_buffer, &overruns);

        let mut samples = sample_buffer.lock().unwrap();
        while samples.len() >= channels {
            let mut energy = 0.0f64;
            for _ in 0..channels {
                let sample = samples.pop_front().unwrap_or_default() as f64;
                energy += sample * sample;
            }
            let bin = ((processed_frames.saturating_mul(SEEKBAR_SPECTRUM_BINS as u64))
                / expected_frames)
                .min((SEEKBAR_SPECTRUM_BINS - 1) as u64) as usize;
            squared_energy[bin] += energy / channels as f64;
            frame_counts[bin] += 1;
            processed_frames += 1;
        }
        samples.clear();
    }

    normalize_waveform_bins(&squared_energy, &frame_counts)
}

fn normalize_waveform_bins(squared_energy: &[f64], frame_counts: &[u64]) -> Vec<f32> {
    let rms = squared_energy
        .iter()
        .zip(frame_counts)
        .map(|(energy, count)| {
            if *count == 0 {
                0.0
            } else {
                (energy / *count as f64).sqrt() as f32
            }
        })
        .collect::<Vec<_>>();
    let peak = rms.iter().copied().fold(0.0f32, f32::max);
    if peak <= f32::EPSILON {
        return vec![0.0; rms.len()];
    }
    rms.into_iter()
        .map(|value| (value / peak).powf(0.7).clamp(0.0, 1.0))
        .collect()
}

fn calculate_spectrum(samples: &[f32], fft: &dyn Fft<f32>) -> Vec<f32> {
    const FFT_SIZE: usize = 1024;
    const BAND_COUNT: usize = 64;

    let mut frame = vec![Complex::new(0.0f32, 0.0f32); FFT_SIZE];
    for (index, sample) in samples.iter().take(FFT_SIZE).enumerate() {
        let window = 0.5 - 0.5 * (std::f32::consts::TAU * index as f32 / (FFT_SIZE - 1) as f32).cos();
        frame[index].re = sample * window;
    }
    fft.process(&mut frame);

    let highest_bin = FFT_SIZE / 2;
    let logarithmic_span = highest_bin as f32;
    (0..BAND_COUNT)
        .map(|band| {
            let low = (logarithmic_span.powf(band as f32 / BAND_COUNT as f32).floor() as usize).max(1);
            let high = (logarithmic_span.powf((band + 1) as f32 / BAND_COUNT as f32).ceil() as usize)
                .max(low + 1)
                .min(highest_bin);
            let mut power = 0.0;
            let mut bins = 0usize;
            for bin in low..high {
                let magnitude = frame[bin].norm() / (FFT_SIZE as f32 * 0.25);
                power += magnitude * magnitude;
                bins += 1;
            }
            if bins == 0 {
                0.0
            } else {
                ((power / bins as f32).sqrt() * 5.5).clamp(0.0, 1.0)
            }
        })
        .collect()
}

/// Helper para listar los dispositivos de salida disponibles
pub fn get_available_audio_devices() -> Vec<String> {
    let host = cpal::default_host();
    let mut names = Vec::new();

    if let Ok(devices) = host.output_devices() {
        for dev in devices {
            if let Ok(name) = dev.name() {
                names.push(name);
            }
        }
    }

    names
}

#[cfg(test)]
mod spectrum_tests {
    use super::{
        analyze_track_waveform, calculate_spectrum, estimate_tempo, normalize_waveform_bins,
        SEEKBAR_SPECTRUM_BINS,
    };
    use rustfft::FftPlanner;
    use std::fs;

    #[test]
    fn fft_places_a_tone_in_a_frequency_band() {
        let sample_rate = 44_100.0;
        let tone = (0..1024)
            .map(|index| {
                (std::f32::consts::TAU * 440.0 * index as f32 / sample_rate).sin() * 0.5
            })
            .collect::<Vec<_>>();
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(1024);

        let spectrum = calculate_spectrum(&tone, fft.as_ref());
        let strongest_band = spectrum
            .iter()
            .enumerate()
            .max_by(|left, right| left.1.total_cmp(right.1))
            .map(|(index, _)| index)
            .unwrap();

        assert!(spectrum[strongest_band] > 0.1);
        assert!((20..36).contains(&strongest_band));
    }

    #[test]
    fn tempo_estimator_finds_a_regular_80_bpm_pulse() {
        let onsets = (0..160)
            .map(|index| if index % 10 == 0 { 1.0 } else { 0.0 })
            .collect::<Vec<_>>();

        let (bpm, confidence) = estimate_tempo(&onsets);

        assert!((bpm.unwrap() - 80.0).abs() < 1.0);
        assert!(confidence > 0.8);
    }

    #[test]
    fn seekbar_waveform_preserves_quiet_and_loud_sections() {
        let mut energy = vec![0.0; SEEKBAR_SPECTRUM_BINS];
        let mut counts = vec![0; SEEKBAR_SPECTRUM_BINS];
        energy[20] = 0.04;
        energy[100] = 1.0;
        counts[20] = 1;
        counts[100] = 1;

        let waveform = normalize_waveform_bins(&energy, &counts);

        assert_eq!(waveform.len(), 192);
        assert!(waveform[20] > 0.0 && waveform[20] < waveform[100]);
        assert_eq!(waveform[100], 1.0);
    }

    #[test]
    fn track_decoder_generates_192_real_waveform_bins() {
        const SAMPLE_RATE: u32 = 44_100;
        let sample_count = SAMPLE_RATE as usize * 2;
        let data_bytes = (sample_count * 2) as u32;
        let mut wav = Vec::with_capacity(44 + data_bytes as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_bytes).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
        wav.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_bytes.to_le_bytes());
        for index in 0..sample_count {
            let amplitude = if index < SAMPLE_RATE as usize { 0.05 } else { 0.8 };
            let sample = (amplitude * (std::f32::consts::TAU * 440.0 * index as f32 / SAMPLE_RATE as f32).sin()
                * i16::MAX as f32) as i16;
            wav.extend_from_slice(&sample.to_le_bytes());
        }

        let path = std::env::temp_dir().join(format!("musicx-waveform-{}.wav", std::process::id()));
        fs::write(&path, wav).unwrap();
        let waveform = analyze_track_waveform(path.to_str().unwrap());
        let _ = fs::remove_file(path);

        assert_eq!(waveform.len(), SEEKBAR_SPECTRUM_BINS);
        let quiet_level = waveform[40..160].iter().sum::<f32>() / 120.0;
        let loud_level = waveform[220..340].iter().sum::<f32>() / 120.0;
        assert!(loud_level > quiet_level * 5.0);
    }
}

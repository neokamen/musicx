import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AudioTelemetry,
  BackendScanProgressPayload,
  BackendTelemetryPayload,
  BufferTelemetry,
  FileNode,
  ScanStatus,
  Track,
} from "../types/index.ts";

export function normalizeTelemetry(payload: BackendTelemetryPayload): AudioTelemetry {
  return {
    state: payload.state,
    current_time: payload.current_position_secs,
    duration: payload.duration_secs,
    sample_rate: payload.sample_rate,
    bits_per_sample: payload.bit_depth,
    bitrate: payload.bitrate_kbps,
    channels: payload.channels,
    volume: payload.volume,
    is_bit_perfect: payload.bit_perfect,
    audio_engine: payload.audio_engine,
    output_device: payload.output_device,
    track_title: payload.track_title,
    track_artist: payload.track_artist,
    track_album: payload.track_album,
    filepath: payload.filepath,
    spectrum: payload.spectrum || [],
    spectrum_left: payload.spectrum_left || payload.spectrum || [],
    spectrum_right: payload.spectrum_right || payload.spectrum || [],
    seekbar_spectrum: payload.seekbar_spectrum || [],
    tempo_bpm: payload.tempo_bpm ?? null,
    tempo_confidence: payload.tempo_confidence ?? 0,
  };
}

export function normalizeScanProgress(payload: BackendScanProgressPayload): ScanStatus {
  return {
    is_scanning: !payload.is_finished,
    current: payload.scanned_files,
    total: payload.total_files,
    current_path: payload.current_path,
  };
}

export async function playTrack(
  path: string,
  bitPerfect: boolean = false,
  deviceName?: string
): Promise<void> {
  return invoke<void>("play_track", {
    path,
    bitPerfect,
    deviceName,
  });
}

export async function pause(): Promise<void> {
  return invoke<void>("pause_track");
}

export async function resume(): Promise<void> {
  return invoke<void>("resume_track");
}

export async function stop(): Promise<void> {
  return invoke<void>("stop_track");
}

export async function seek(seconds: number): Promise<void> {
  return invoke<void>("seek_track", { positionSeconds: seconds });
}

export async function setVolume(vol: number): Promise<void> {
  return invoke<void>("set_volume", { volume: vol });
}

export async function setOutputDevice(
  deviceName?: string,
  bitPerfect: boolean = false
): Promise<void> {
  return invoke<void>("set_output_device", {
    deviceName,
    bitPerfect,
  });
}

export async function setBitPerfect(enabled: boolean): Promise<void> {
  return invoke<void>("set_output_device", {
    deviceName: undefined,
    bitPerfect: enabled,
  });
}

export async function setAudioEngine(engine: string): Promise<void> {
  return invoke<void>("set_audio_engine", { engine });
}

export async function setDspSettings(settings: {
  is_eq_enabled?: boolean;
  eq_gains?: number[];
  is_normalizer_enabled?: boolean;
  is_xdss_enabled?: boolean;
  is_xts_pro_enabled?: boolean;
  tube_warmth?: boolean;
}): Promise<void> {
  return invoke<void>("set_dsp_settings", { settings });
}

export async function listAudioDevices(): Promise<string[]> {
  return invoke<string[]>("list_audio_devices");
}

export async function readDirectoryLazy(path: string): Promise<FileNode[]> {
  return invoke<FileNode[]>("read_directory_lazy", { path });
}

export async function scanFolderTracksRecursive(path: string): Promise<Track[]> {
  return invoke<Track[]>("scan_folder_tracks_recursive", { path });
}

export async function triggerScan(path: string, _force: boolean = false): Promise<void> {
  return invoke<void>("scan_directory", { path });
}

export async function getTracksFromDb(query?: string): Promise<Track[]> {
  return invoke<Track[]>("get_library_tracks", {
    query: query && query.trim().length > 0 ? query.trim() : null,
  });
}

export async function getTrackMetadata(path: string): Promise<Track> {
  return invoke<Track>("get_track_metadata", { path });
}

export async function getAudioEngineStatus(): Promise<{
  engine: string;
  status: string;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  driver: string;
  supported_codecs: string[];
}> {
  return invoke("get_audio_engine_status");
}

export async function onAudioTelemetry(
  callback: (telemetry: AudioTelemetry) => void
): Promise<UnlistenFn> {
  return listen<BackendTelemetryPayload>("audio-telemetry", (event) => {
    callback(normalizeTelemetry(event.payload));
  });
}

export async function onScanProgress(
  callback: (status: ScanStatus) => void
): Promise<UnlistenFn> {
  return listen<BackendScanProgressPayload>("scan-progress", (event) => {
    callback(normalizeScanProgress(event.payload));
  });
}

export async function getTrackCoverArt(filepath: string): Promise<string | null> {
  return invoke<string | null>("get_track_cover_art", { path: filepath });
}

export async function onTrackEnded(
  callback: (filepath: string) => void
): Promise<UnlistenFn> {
  return listen<string>("track-ended", (event) => {
    callback(event.payload);
  });
}

export async function getBufferTelemetry(): Promise<BufferTelemetry> {
  return invoke<BufferTelemetry>("get_buffer_telemetry");
}

export async function setAudioBufferSize(frames: number): Promise<number> {
  return invoke<number>("set_audio_buffer_size", { frames });
}

export async function resetAudioXruns(): Promise<void> {
  return invoke<void>("reset_audio_xruns");
}

export async function onBufferTelemetry(
  callback: (telemetry: BufferTelemetry) => void
): Promise<UnlistenFn> {
  return listen<BufferTelemetry>("buffer-telemetry", (event) => {
    callback(event.payload);
  });
}

export async function saveRadioRecording(
  targetDir: string,
  filename: string,
  data: Uint8Array
): Promise<string> {
  return invoke<string>("save_radio_recording", {
    targetDir,
    filename,
    data: Array.from(data),
  });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke<void>("write_text_file", { path, contents });
}

export async function readTextFile(path: string): Promise<string | null> {
  return invoke<string | null>("read_text_file", { path });
}

// Local relay used to get real byte counts + ICY song-title metadata for internet radio streams
export async function startRadioRelay(url: string): Promise<string> {
  return invoke<string>("start_radio_relay", { url });
}

export async function stopRadioRelay(): Promise<void> {
  return invoke<void>("stop_radio_relay");
}

export async function onRadioRelayBytes(callback: (bytesTotal: number) => void): Promise<UnlistenFn> {
  return listen<{ bytes_total: number }>("radio-relay-bytes", (event) => {
    callback(event.payload.bytes_total);
  });
}

export async function onRadioRelayTrack(callback: (title: string) => void): Promise<UnlistenFn> {
  return listen<{ title: string }>("radio-relay-track", (event) => {
    callback(event.payload.title);
  });
}

export async function getStreamAudioUrl(urlOrId: string): Promise<string> {
  return invoke<string>("get_stream_audio_url", { urlOrId });
}

export type RuntimeToolStatus = {
  name: string;
  installed: boolean;
  version: string;
  path: string;
  source: string;
};

export type RuntimeDepsStatus = {
  os: string;
  osLabel: string;
  distroId: string;
  distroName: string;
  packageFamily: string;
  packageManager: string;
  hint: string;
  ytdlp: RuntimeToolStatus;
  ffmpeg: RuntimeToolStatus;
  nodeAvailable: boolean;
};

export async function getRuntimeDepsStatus(): Promise<RuntimeDepsStatus> {
  return invoke<RuntimeDepsStatus>("get_runtime_deps_status");
}

export async function installOrUpdateRuntimeDeps(): Promise<string> {
  return invoke<string>("install_or_update_runtime_deps");
}

// Aliases
export const pauseAudio = pause;
export const resumeAudio = resume;
export const stopAudio = stop;
export const seekAudio = seek;
export const getAudioDevices = listAudioDevices;
export const readDirectory = readDirectoryLazy;
export const scanDirectory = triggerScan;
export const searchTracks = getTracksFromDb;

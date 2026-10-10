export interface MpdConfig {
  host: string;
  port: number;
  password?: string | null;
  remote_mount_path?: string | null;
  path_strip_prefix?: string | null;
  smb_user?: string | null;
  smb_password?: string | null;
  smb_domain?: string | null;
  http_stream_url?: string | null;
}

export interface MpdStats {
  artists: number;
  albums: number;
  songs: number;
  uptime: number;
  playtime: number;
  db_playtime: number;
  db_update: number;
}

export interface MpdSongItem {
  file: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  track?: string | null;
  duration: number;
  format?: string | null;
  size: number;
  last_modified?: string | null;
  last_modified_timestamp: number;
  pos?: number | null;
  id?: number | null;
}

export interface MpdServerStatus {
  connected: boolean;
  host: string;
  port: number;
  version: string;
  ping_ms: number;
  state: "play" | "pause" | "stop" | "disconnected" | string;
  volume: number;
  repeat: boolean;
  random: boolean;
  single: boolean;
  consume: boolean;
  playlist_length: number;
  current_song?: MpdSongItem | null;
  elapsed: number;
  duration: number;
  bitrate?: number | null;
  audio?: string | null;
  stats: MpdStats;
  error?: string | null;
}

export interface MpdDiscoveredServer {
  host: string;
  port: number;
  version: string;
  name: string;
}

export interface MpdOutputDevice {
  id: number;
  name: string;
  plugin: string;
  enabled: boolean;
}

export interface MpdDirectoryItem {
  is_directory: boolean;
  path: string;
  name: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  duration: number;
  format?: string | null;
  size: number;
  last_modified?: string | null;
  last_modified_timestamp: number;
}

export type DiffStatus = "in_sync" | "only_mpd" | "only_local" | "modified";

export interface LibraryDiffItem {
  relative_path: string;
  filename: string;
  title: string;
  artist: string;
  album: string;
  status: DiffStatus;
  mpd_size?: number | null;
  local_size?: number | null;
  mpd_mtime?: number | null;
  local_mtime?: number | null;
  mpd_mtime_str?: string | null;
  local_mtime_str?: string | null;
  newer_side?: "mpd" | "local" | "same" | null;
  time_diff_seconds?: number | null;
  duration: number;
  format?: string | null;
}

export interface LibraryDiffResult {
  total_mpd: number;
  total_local: number;
  count_in_sync: number;
  count_only_mpd: number;
  count_only_local: number;
  count_modified: number;
  items: LibraryDiffItem[];
}

export interface MpdTransferProgress {
  current_file: string;
  current_index: number;
  total_files: number;
  bytes_copied: number;
  total_bytes: number;
  percentage: number;
  status: "in_progress" | "completed" | "error" | string;
  error?: string | null;
}


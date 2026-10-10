import { invoke } from "@tauri-apps/api/core";
import type {
  MpdConfig,
  MpdServerStatus,
  MpdDiscoveredServer,
  MpdDirectoryItem,
  LibraryDiffResult,
} from "../types/mpd";

const MPD_CONFIG_KEY = "musicx_mpd_config";

export function getSavedMpdConfig(): MpdConfig {
  try {
    const raw = localStorage.getItem(MPD_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        host: parsed.host || "127.0.0.1",
        port: Number(parsed.port) || 6600,
        password: parsed.password || null,
        remote_mount_path: parsed.remote_mount_path || null,
        http_stream_url: parsed.http_stream_url || null,
      };
    }
  } catch {
    // Fallback on error
  }
  return {
    host: "127.0.0.1",
    port: 6600,
    password: null,
    remote_mount_path: null,
    http_stream_url: null,
  };
}

export function saveMpdConfig(config: MpdConfig): void {
  try {
    localStorage.setItem(MPD_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("Error saving MPD config to localStorage:", e);
  }
}

export async function mpdGetStatus(
  host: string,
  port: number,
  password?: string | null
): Promise<MpdServerStatus> {
  return await invoke<MpdServerStatus>("mpd_get_status", {
    host,
    port,
    password: password || null,
  });
}

export async function mpdDiscoverServers(): Promise<MpdDiscoveredServer[]> {
  return await invoke<MpdDiscoveredServer[]>("mpd_discover_servers");
}

export async function mpdListDirectory(
  host: string,
  port: number,
  password: string | null | undefined,
  path: string
): Promise<MpdDirectoryItem[]> {
  return await invoke<MpdDirectoryItem[]>("mpd_list_directory", {
    host,
    port,
    password: password || null,
    path,
  });
}

export async function mpdSendCommand(
  host: string,
  port: number,
  password: string | null | undefined,
  command: string,
  arg?: string | null
): Promise<string> {
  return await invoke<string>("mpd_send_command", {
    host,
    port,
    password: password || null,
    command,
    arg: arg || null,
  });
}

export async function mpdCompareLibraries(
  config: MpdConfig,
  localMusicDir: string,
  subpath?: string | null
): Promise<LibraryDiffResult> {
  return await invoke<LibraryDiffResult>("mpd_compare_libraries", {
    config,
    localMusicDir,
    subpath: subpath || null,
  });
}

export async function mpdTransferFiles(
  direction: "download_from_mpd" | "upload_to_mpd",
  relativePaths: string[],
  localBaseDir: string,
  remoteMountPath: string,
  mpdConfig?: MpdConfig | null
): Promise<number> {
  return await invoke<number>("mpd_transfer_files", {
    direction,
    relativePaths,
    localBaseDir,
    remoteMountPath,
    mpdConfig: mpdConfig || null,
  });
}

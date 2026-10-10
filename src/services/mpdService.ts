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
        path_strip_prefix: parsed.path_strip_prefix || null,
        smb_user: parsed.smb_user || null,
        smb_password: parsed.smb_password || null,
        smb_domain: parsed.smb_domain || null,
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
    path_strip_prefix: null,
    smb_user: null,
    smb_password: null,
    smb_domain: null,
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

/**
 * Resolves an MPD track relative path into a playable path for MusicX
 */
export function resolveMpdTrackPath(mpdPath: string, config: MpdConfig): string {
  let cleanMpdPath = mpdPath.replace(/\\/g, "/");

  // Strip user-configured prefix if present (e.g. "USB/rootfs/mnt/SDCARD/" or "USB/")
  if (config.path_strip_prefix && config.path_strip_prefix.trim()) {
    const prefix = config.path_strip_prefix.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (cleanMpdPath.startsWith(prefix + "/")) {
      cleanMpdPath = cleanMpdPath.slice(prefix.length + 1);
    } else if (cleanMpdPath.startsWith(prefix)) {
      cleanMpdPath = cleanMpdPath.slice(prefix.length);
    }
  }

  // If remote mount path is specified
  if (config.remote_mount_path && config.remote_mount_path.trim()) {
    let mount = config.remote_mount_path.trim().replace(/\/+$/, "");

    // Convert smb:// URLs to local gvfs mount path on Linux if applicable
    if (mount.startsWith("smb://")) {
      const urlWithoutScheme = mount.slice(6);
      const parts = urlWithoutScheme.split("/");
      const server = parts[0];
      const share = parts[1] || "";
      const subpath = parts.slice(2).join("/");

      // Standard Linux GVFS mount location: /run/user/<uid>/gvfs/smb-share:server=<server>,share=<share>/...
      const gvfsPrefix = `/run/user/1000/gvfs/smb-share:server=${server},share=${share}`;
      mount = subpath ? `${gvfsPrefix}/${subpath}` : gvfsPrefix;
    }

    const cleanRel = cleanMpdPath.replace(/^\/+/, "");

    // Smart overlap: if mount path already ends with first directory of cleanRel, avoid duplication
    const firstSegment = cleanRel.split("/")[0];
    if (firstSegment && mount.endsWith("/" + firstSegment)) {
      const afterFirst = cleanRel.slice(firstSegment.length + 1);
      return `${mount}/${afterFirst}`;
    }

    return `${mount}/${cleanRel}`;
  }

  // Fallback to HTTP stream if configured
  if (config.http_stream_url && config.http_stream_url.trim()) {
    return config.http_stream_url.trim();
  }

  return cleanMpdPath;
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


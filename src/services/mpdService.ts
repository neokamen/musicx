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
      const cfg: MpdConfig = {
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
      void invoke("mpd_save_config", { config: cfg }).catch(() => {});
      return cfg;
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
    void invoke("mpd_save_config", { config }).catch(() => {});
  } catch (e) {
    console.error("Error saving MPD config to localStorage:", e);
  }
}

/**
 * Resolves an MPD track relative path into a playable path for MusicX
 */
export function resolveMpdTrackPath(mpdPath: string, config: MpdConfig): string {
  let cleanMpdPath = mpdPath.replace(/\\/g, "/");

  // Detect SMB candidate URL in either remote_mount_path or path_strip_prefix
  const smbCandidate =
    (config.remote_mount_path && config.remote_mount_path.startsWith("smb://")
      ? config.remote_mount_path
      : null) ||
    (config.path_strip_prefix && config.path_strip_prefix.startsWith("smb://")
      ? config.path_strip_prefix
      : null);

  if (smbCandidate) {
    const withoutScheme = smbCandidate.replace(/^smb:\/\//, "").replace(/\/+$/, "");
    const parts = withoutScheme.split("/").filter(Boolean);
    const server = parts[0] || config.host;
    const share = parts[1] || "rootfs";
    const baseSub = parts.slice(2).join("/");

    let relInShare = cleanMpdPath.replace(/^\/+/, "");
    const sharePattern = `${share}/`;
    if (relInShare.includes(sharePattern)) {
      const idx = relInShare.indexOf(sharePattern);
      relInShare = relInShare.slice(idx + sharePattern.length);
    } else if (baseSub && !relInShare.startsWith(baseSub)) {
      relInShare = `${baseSub.replace(/\/+$/, "")}/${relInShare}`;
    }
    return `smb://${server}/${share}/${relInShare}`;
  }

  // Strip user-configured prefix if present (e.g. "USB/rootfs/mnt/SDCARD/" or "USB/")
  if (config.path_strip_prefix && config.path_strip_prefix.trim()) {
    const prefix = config.path_strip_prefix.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (cleanMpdPath.startsWith(prefix + "/")) {
      cleanMpdPath = cleanMpdPath.slice(prefix.length + 1);
    } else if (cleanMpdPath.startsWith(prefix)) {
      cleanMpdPath = cleanMpdPath.slice(prefix.length);
    }
  }

  // If remote local mount path is specified (e.g. NFS / local SMB mount)
  if (config.remote_mount_path && config.remote_mount_path.trim()) {
    const mount = config.remote_mount_path.trim().replace(/\/+$/, "");
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


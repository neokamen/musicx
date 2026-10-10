use chrono::{DateTime, NaiveDateTime};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::path::Path;
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::time::timeout;

// ============================================================================
// DATA STRUCTURES
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpdConfig {
    pub host: String,
    pub port: u16,
    pub password: Option<String>,
    pub remote_mount_path: Option<String>,
    pub path_strip_prefix: Option<String>,
    pub smb_user: Option<String>,
    pub smb_password: Option<String>,
    pub smb_domain: Option<String>,
    pub http_stream_url: Option<String>,
}

impl Default for MpdConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 6600,
            password: None,
            remote_mount_path: None,
            path_strip_prefix: None,
            smb_user: None,
            smb_password: None,
            smb_domain: None,
            http_stream_url: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MpdStats {
    pub artists: u32,
    pub albums: u32,
    pub songs: u32,
    pub uptime: u64,
    pub playtime: u64,
    pub db_playtime: u64,
    pub db_update: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpdSongItem {
    pub file: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub track: Option<String>,
    pub duration: f64,
    pub format: Option<String>,
    pub size: u64,
    pub last_modified: Option<String>,
    pub last_modified_timestamp: i64,
    pub pos: Option<u32>,
    pub id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpdServerStatus {
    pub connected: bool,
    pub host: String,
    pub port: u16,
    pub version: String,
    pub ping_ms: u64,
    pub state: String, // "play", "pause", "stop"
    pub volume: i32,   // -1 if disabled/unavailable
    pub repeat: bool,
    pub random: bool,
    pub single: bool,
    pub consume: bool,
    pub playlist_length: u32,
    pub current_song: Option<MpdSongItem>,
    pub elapsed: f64,
    pub duration: f64,
    pub bitrate: Option<u32>,
    pub audio: Option<String>,
    pub stats: MpdStats,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpdDiscoveredServer {
    pub host: String,
    pub port: u16,
    pub version: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpdOutputDevice {
    pub id: u32,
    pub name: String,
    pub plugin: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpdDirectoryItem {
    pub is_directory: bool,
    pub path: String,
    pub name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: f64,
    pub format: Option<String>,
    pub size: u64,
    pub last_modified: Option<String>,
    pub last_modified_timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DiffStatus {
    InSync,
    OnlyMpd,
    OnlyLocal,
    Modified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryDiffItem {
    pub relative_path: String,
    pub filename: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub status: DiffStatus,
    pub mpd_size: Option<u64>,
    pub local_size: Option<u64>,
    pub mpd_mtime: Option<i64>,
    pub local_mtime: Option<i64>,
    pub mpd_mtime_str: Option<String>,
    pub local_mtime_str: Option<String>,
    pub newer_side: Option<String>, // "mpd" | "local" | "same"
    pub time_diff_seconds: Option<i64>,
    pub duration: f64,
    pub format: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryDiffResult {
    pub total_mpd: usize,
    pub total_local: usize,
    pub count_in_sync: usize,
    pub count_only_mpd: usize,
    pub count_only_local: usize,
    pub count_modified: usize,
    pub items: Vec<LibraryDiffItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MpdTransferProgress {
    pub current_file: String,
    pub current_index: usize,
    pub total_files: usize,
    pub bytes_copied: u64,
    pub total_bytes: u64,
    pub percentage: f64,
    pub status: String, // "in_progress", "completed", "error"
    pub error: Option<String>,
}

// ============================================================================
// HELPER PROTOCOL UTILITIES
// ============================================================================

pub fn parse_mpd_date_to_timestamp(s: &str) -> i64 {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return dt.timestamp();
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%SZ") {
        return ndt.and_utc().timestamp();
    }
    if let Ok(ndt) = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S") {
        return ndt.and_utc().timestamp();
    }
    0
}

pub fn format_timestamp(ts: i64) -> String {
    if ts <= 0 {
        return "Desconocida".to_string();
    }
    if let Some(dt) = DateTime::from_timestamp(ts, 0) {
        return dt.format("%Y-%m-%d %H:%M:%S").to_string();
    }
    "Desconocida".to_string()
}

// Low-level TCP connect and handshake
async fn connect_mpd(
    host: &str,
    port: u16,
    password: Option<&str>,
    timeout_ms: u64,
) -> Result<(BufReader<TcpStream>, String), String> {
    let addr = format!("{}:{}", host, port);
    let start_time = Instant::now();

    let stream = timeout(
        Duration::from_millis(timeout_ms),
        TcpStream::connect(&addr),
    )
    .await
    .map_err(|_| format!("Tiempo de espera agotado conectando a {}", addr))?
    .map_err(|e| format!("Error conectando a {}: {}", addr, e))?;

    let mut reader = BufReader::new(stream);
    let mut greeting = String::new();

    timeout(
        Duration::from_millis(timeout_ms),
        reader.read_line(&mut greeting),
    )
    .await
    .map_err(|_| "Tiempo de espera leyendo saludo de MPD".to_string())?
    .map_err(|e| format!("Error leyendo saludo: {}", e))?;

    let greeting = greeting.trim();
    if !greeting.starts_with("OK MPD ") {
        return Err(format!("Respuesta inválida del servidor MPD: {}", greeting));
    }
    let version = greeting.trim_start_matches("OK MPD ").trim().to_string();

    // Authenticate if password provided
    if let Some(pass) = password {
        if !pass.trim().is_empty() {
            let pass_cmd = format!("password \"{}\"\n", pass.replace('\"', "\\\""));
            reader
                .get_mut()
                .write_all(pass_cmd.as_bytes())
                .await
                .map_err(|e| format!("Error enviando contraseña: {}", e))?;
            reader
                .get_mut()
                .flush()
                .await
                .map_err(|e| format!("Error limpiando buffer: {}", e))?;

            let mut auth_resp = String::new();
            reader
                .read_line(&mut auth_resp)
                .await
                .map_err(|e| format!("Error leyendo respuesta de contraseña: {}", e))?;
            let auth_resp = auth_resp.trim();
            if !auth_resp.starts_with("OK") {
                return Err(format!("Contraseña de MPD incorrecta: {}", auth_resp));
            }
        }
    }

    let _ = start_time;
    Ok((reader, version))
}

// Send command and read lines until "OK" or "ACK"
async fn execute_command(
    reader: &mut BufReader<TcpStream>,
    cmd: &str,
) -> Result<Vec<String>, String> {
    let full_cmd = if cmd.ends_with('\n') {
        cmd.to_string()
    } else {
        format!("{}\n", cmd)
    };

    reader
        .get_mut()
        .write_all(full_cmd.as_bytes())
        .await
        .map_err(|e| format!("Error enviando comando MPD: {}", e))?;
    reader
        .get_mut()
        .flush()
        .await
        .map_err(|e| format!("Error en flush MPD: {}", e))?;

    let mut lines = Vec::new();
    loop {
        let mut line = String::new();
        let bytes = reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("Error leyendo línea de MPD: {}", e))?;
        if bytes == 0 {
            break;
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.starts_with("OK") {
            break;
        }
        if trimmed.starts_with("ACK") {
            return Err(trimmed.to_string());
        }
        lines.push(trimmed.to_string());
    }

    Ok(lines)
}

// Parse key-value lines
fn parse_kv_lines(lines: &[String]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(": ") {
            map.insert(k.trim().to_lowercase(), v.trim().to_string());
        }
    }
    map
}

// ============================================================================
// MPD PROTOCOL OPERATIONS
// ============================================================================

pub async fn ping_and_get_status(
    host: &str,
    port: u16,
    password: Option<&str>,
) -> MpdServerStatus {
    let start = Instant::now();
    let (mut reader, version) = match connect_mpd(host, port, password, 2500).await {
        Ok(res) => res,
        Err(e) => {
            return MpdServerStatus {
                connected: false,
                host: host.to_string(),
                port,
                version: String::new(),
                ping_ms: 0,
                state: "disconnected".to_string(),
                volume: -1,
                repeat: false,
                random: false,
                single: false,
                consume: false,
                playlist_length: 0,
                current_song: None,
                elapsed: 0.0,
                duration: 0.0,
                bitrate: None,
                audio: None,
                stats: MpdStats::default(),
                error: Some(e),
            };
        }
    };

    let ping_ms = start.elapsed().as_millis() as u64;

    // Fetch status
    let status_lines = execute_command(&mut reader, "status").await.unwrap_or_default();
    let status_map = parse_kv_lines(&status_lines);

    // Fetch stats
    let stats_lines = execute_command(&mut reader, "stats").await.unwrap_or_default();
    let stats_map = parse_kv_lines(&stats_lines);

    // Fetch current song if playing/paused
    let song_lines = execute_command(&mut reader, "currentsong").await.unwrap_or_default();
    let song_map = parse_kv_lines(&song_lines);

    let current_song = if let Some(file) = song_map.get("file") {
        Some(MpdSongItem {
            file: file.clone(),
            title: song_map.get("title").cloned(),
            artist: song_map.get("artist").cloned(),
            album: song_map.get("album").cloned(),
            track: song_map.get("track").cloned(),
            duration: song_map
                .get("duration")
                .or_else(|| song_map.get("time"))
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.0),
            format: song_map.get("format").cloned(),
            size: song_map.get("size").and_then(|v| v.parse().ok()).unwrap_or(0),
            last_modified: song_map.get("last-modified").cloned(),
            last_modified_timestamp: song_map
                .get("last-modified")
                .map(|s| parse_mpd_date_to_timestamp(s))
                .unwrap_or(0),
            pos: song_map.get("pos").and_then(|v| v.parse().ok()),
            id: song_map.get("id").and_then(|v| v.parse().ok()),
        })
    } else {
        None
    };

    let stats = MpdStats {
        artists: stats_map.get("artists").and_then(|v| v.parse().ok()).unwrap_or(0),
        albums: stats_map.get("albums").and_then(|v| v.parse().ok()).unwrap_or(0),
        songs: stats_map.get("songs").and_then(|v| v.parse().ok()).unwrap_or(0),
        uptime: stats_map.get("uptime").and_then(|v| v.parse().ok()).unwrap_or(0),
        playtime: stats_map.get("playtime").and_then(|v| v.parse().ok()).unwrap_or(0),
        db_playtime: stats_map.get("db_playtime").and_then(|v| v.parse().ok()).unwrap_or(0),
        db_update: stats_map.get("db_update").and_then(|v| v.parse().ok()).unwrap_or(0),
    };

    let state = status_map
        .get("state")
        .cloned()
        .unwrap_or_else(|| "stop".to_string());
    let volume = status_map
        .get("volume")
        .and_then(|v| v.parse().ok())
        .unwrap_or(-1);
    let repeat = status_map.get("repeat").map(|v| v == "1").unwrap_or(false);
    let random = status_map.get("random").map(|v| v == "1").unwrap_or(false);
    let single = status_map.get("single").map(|v| v == "1").unwrap_or(false);
    let consume = status_map.get("consume").map(|v| v == "1").unwrap_or(false);
    let playlist_length = status_map
        .get("playlistlength")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let elapsed = status_map
        .get("elapsed")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.0);
    let duration = status_map
        .get("duration")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.0);
    let bitrate = status_map.get("bitrate").and_then(|v| v.parse().ok());
    let audio = status_map.get("audio").cloned();

    MpdServerStatus {
        connected: true,
        host: host.to_string(),
        port,
        version,
        ping_ms,
        state,
        volume,
        repeat,
        random,
        single,
        consume,
        playlist_length,
        current_song,
        elapsed,
        duration,
        bitrate,
        audio,
        stats,
        error: None,
    }
}

pub fn is_audio_or_cover_file(path_str: &str) -> bool {
    let p = Path::new(path_str);
    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
        if name.starts_with('.') {
            return false;
        }
    }
    for comp in p.components() {
        let s = comp.as_os_str().to_string_lossy();
        if s.starts_with('.') || s == "lost+found" || s == "__MACOSX" || s == "System Volume Information" {
            return false;
        }
    }
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    matches!(
        ext.as_str(),
        "mp3" | "flac" | "wav" | "ogg" | "m4a" | "aac" | "opus" | "alac" | "wma" | "aiff" | "dsf" | "dff"
        | "jpg" | "jpeg" | "png" | "webp"
    )
}

// List contents of a remote directory via `lsinfo`
pub async fn list_directory(
    host: &str,
    port: u16,
    password: Option<&str>,
    dir_path: &str,
) -> Result<Vec<MpdDirectoryItem>, String> {
    let (mut reader, _) = connect_mpd(host, port, password, 3000).await?;

    let clean_dir = if dir_path.starts_with("smb://") {
        let without = dir_path.trim_start_matches("smb://");
        let parts: Vec<&str> = without.split('/').filter(|s| !s.is_empty()).collect();
        if parts.len() > 1 {
            parts[1..].join("/")
        } else {
            parts.join("/")
        }
    } else {
        dir_path.replace('\\', "/").trim_matches('/').to_string()
    };

    let lines = if clean_dir.is_empty() {
        execute_command(&mut reader, "lsinfo\n").await?
    } else {
        let cmd = format!("lsinfo \"{}\"\n", clean_dir.replace('\"', "\\\""));
        match execute_command(&mut reader, &cmd).await {
            Ok(lines) => lines,
            Err(_) => {
                // If not found, try prepending "USB/" if not already starting with USB
                let usb_cmd = format!("lsinfo \"USB/{}\"\n", clean_dir.replace('\"', "\\\""));
                match execute_command(&mut reader, &usb_cmd).await {
                    Ok(lines) => lines,
                    Err(_) => {
                        // Check top-level directories in MPD root to find where clean_dir exists
                        let mut found = None;
                        if let Ok(root_lines) = execute_command(&mut reader, "lsinfo\n").await {
                            for r_line in root_lines {
                                if let Some((k, v)) = r_line.split_once(": ") {
                                    if k.trim().to_lowercase() == "directory" {
                                        let cand = format!("{}/{}", v.trim(), clean_dir);
                                        let cand_cmd = format!("lsinfo \"{}\"\n", cand.replace('\"', "\\\""));
                                        if let Ok(cand_lines) = execute_command(&mut reader, &cand_cmd).await {
                                            found = Some(cand_lines);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        match found {
                            Some(l) => l,
                            None => return Err(format!("Directorio no encontrado en MPD: {}", dir_path)),
                        }
                    }
                }
            }
        }
    };

    let mut items = Vec::new();
    let mut current_item: Option<MpdDirectoryItem> = None;

    for line in lines {
        if let Some((k, v)) = line.split_once(": ") {
            let key = k.trim().to_lowercase();
            let val = v.trim().to_string();

            if key == "directory" {
                if let Some(item) = current_item.take() {
                    items.push(item);
                }
                let name = Path::new(&val)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&val)
                    .to_string();
                current_item = Some(MpdDirectoryItem {
                    is_directory: true,
                    path: val,
                    name,
                    title: None,
                    artist: None,
                    album: None,
                    duration: 0.0,
                    format: None,
                    size: 0,
                    last_modified: None,
                    last_modified_timestamp: 0,
                });
            } else if key == "file" {
                if !is_audio_or_cover_file(&val) {
                    continue;
                }
                if let Some(item) = current_item.take() {
                    items.push(item);
                }
                let name = Path::new(&val)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&val)
                    .to_string();
                current_item = Some(MpdDirectoryItem {
                    is_directory: false,
                    path: val,
                    name,
                    title: None,
                    artist: None,
                    album: None,
                    duration: 0.0,
                    format: None,
                    size: 0,
                    last_modified: None,
                    last_modified_timestamp: 0,
                });
            } else if let Some(ref mut item) = current_item {
                match key.as_str() {
                    "title" => item.title = Some(val),
                    "artist" => item.artist = Some(val),
                    "album" => item.album = Some(val),
                    "time" | "duration" => {
                        if let Ok(d) = val.parse::<f64>() {
                            item.duration = d;
                        }
                    }
                    "size" => {
                        if let Ok(sz) = val.parse::<u64>() {
                            item.size = sz;
                        }
                    }
                    "format" => item.format = Some(val),
                    "last-modified" => {
                        item.last_modified_timestamp = parse_mpd_date_to_timestamp(&val);
                        item.last_modified = Some(val);
                    }
                    _ => {}
                }
            }
        }
    }

    if let Some(item) = current_item {
        items.push(item);
    }

    // Sort: directories first, then alphabetical by name
    items.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(items)
}

// Fetch all songs recursively from MPD via `listallinfo`
pub async fn list_all_songs(
    host: &str,
    port: u16,
    password: Option<&str>,
    subpath: Option<&str>,
) -> Result<Vec<MpdSongItem>, String> {
    let (mut reader, _) = connect_mpd(host, port, password, 5000).await?;

    let cmd = match subpath {
        Some(p) if !p.trim().is_empty() => format!("listallinfo \"{}\"\n", p.replace('\"', "\\\"")),
        _ => "listallinfo\n".to_string(),
    };

    let lines = execute_command(&mut reader, &cmd).await?;
    let mut songs = Vec::new();
    let mut current_song: Option<MpdSongItem> = None;

    for line in lines {
        if let Some((k, v)) = line.split_once(": ") {
            let key = k.trim().to_lowercase();
            let val = v.trim().to_string();

            if key == "file" {
                if let Some(s) = current_song.take() {
                    songs.push(s);
                }
                current_song = Some(MpdSongItem {
                    file: val,
                    title: None,
                    artist: None,
                    album: None,
                    track: None,
                    duration: 0.0,
                    format: None,
                    size: 0,
                    last_modified: None,
                    last_modified_timestamp: 0,
                    pos: None,
                    id: None,
                });
            } else if let Some(ref mut song) = current_song {
                match key.as_str() {
                    "title" => song.title = Some(val),
                    "artist" => song.artist = Some(val),
                    "album" => song.album = Some(val),
                    "track" => song.track = Some(val),
                    "time" | "duration" => {
                        if let Ok(d) = val.parse::<f64>() {
                            song.duration = d;
                        }
                    }
                    "size" => {
                        if let Ok(sz) = val.parse::<u64>() {
                            song.size = sz;
                        }
                    }
                    "format" => song.format = Some(val),
                    "last-modified" => {
                        song.last_modified_timestamp = parse_mpd_date_to_timestamp(&val);
                        song.last_modified = Some(val);
                    }
                    _ => {}
                }
            }
        }
    }

    if let Some(s) = current_song {
        songs.push(s);
    }

    Ok(songs)
}

// Playback and transport control commands
pub async fn send_playback_command(
    host: &str,
    port: u16,
    password: Option<&str>,
    command: &str,
    arg: Option<&str>,
) -> Result<String, String> {
    let (mut reader, _) = connect_mpd(host, port, password, 2500).await?;

    let cmd_str = match (command, arg) {
        ("play", Some(pos)) => format!("play {}\n", pos),
        ("play", None) => "play\n".to_string(),
        ("pause", Some(state)) => format!("pause {}\n", state),
        ("pause", None) => "pause 1\n".to_string(),
        ("resume", _) => "pause 0\n".to_string(),
        ("toggle_pause", _) => {
            // Check state first or send toggle
            "pause\n".to_string()
        }
        ("stop", _) => "stop\n".to_string(),
        ("next", _) => "next\n".to_string(),
        ("previous", _) => "previous\n".to_string(),
        ("seek", Some(sec)) => format!("seekcur {}\n", sec),
        ("setvol", Some(vol)) => format!("setvol {}\n", vol),
        ("repeat", Some(val)) => format!("repeat {}\n", val),
        ("random", Some(val)) => format!("random {}\n", val),
        ("single", Some(val)) => format!("single {}\n", val),
        ("consume", Some(val)) => format!("consume {}\n", val),
        ("crossfade", Some(val)) => format!("crossfade {}\n", val),
        ("playid", Some(id)) => format!("playid {}\n", id),
        ("deleteid", Some(id)) => format!("deleteid {}\n", id),
        ("shuffle", _) => "shuffle\n".to_string(),
        ("enableoutput", Some(id)) => format!("enableoutput {}\n", id),
        ("disableoutput", Some(id)) => format!("disableoutput {}\n", id),
        ("add", Some(uri)) => format!("add \"{}\"\n", uri.replace('\"', "\\\"")),
        ("delete", Some(pos)) => format!("delete {}\n", pos),
        ("clear", _) => "clear\n".to_string(),
        ("update", Some(uri)) => format!("update \"{}\"\n", uri.replace('\"', "\\\"")),
        ("update", None) => "update\n".to_string(),
        (cmd, Some(a)) => format!("{} {}\n", cmd, a),
        (cmd, None) => format!("{}\n", cmd),
    };

    execute_command(&mut reader, &cmd_str).await?;
    Ok("OK".to_string())
}

// Fetch current active queue / playlist info from MPD
pub async fn get_playlist_info(
    host: &str,
    port: u16,
    password: Option<&str>,
) -> Result<Vec<MpdSongItem>, String> {
    let (mut reader, _) = connect_mpd(host, port, password, 3000).await?;
    let lines = execute_command(&mut reader, "playlistinfo\n").await?;
    let mut songs = Vec::new();
    let mut current_song: Option<MpdSongItem> = None;

    for line in lines {
        if let Some((k, v)) = line.split_once(": ") {
            let key = k.trim().to_lowercase();
            let val = v.trim().to_string();

            if key == "file" {
                if let Some(s) = current_song.take() {
                    songs.push(s);
                }
                current_song = Some(MpdSongItem {
                    file: val,
                    title: None,
                    artist: None,
                    album: None,
                    track: None,
                    duration: 0.0,
                    format: None,
                    size: 0,
                    last_modified: None,
                    last_modified_timestamp: 0,
                    pos: None,
                    id: None,
                });
            } else if let Some(ref mut song) = current_song {
                match key.as_str() {
                    "title" => song.title = Some(val),
                    "artist" => song.artist = Some(val),
                    "album" => song.album = Some(val),
                    "track" => song.track = Some(val),
                    "time" | "duration" => {
                        if let Ok(d) = val.parse::<f64>() {
                            song.duration = d;
                        }
                    }
                    "pos" => {
                        if let Ok(p) = val.parse::<u32>() {
                            song.pos = Some(p);
                        }
                    }
                    "id" => {
                        if let Ok(i) = val.parse::<u32>() {
                            song.id = Some(i);
                        }
                    }
                    "size" => {
                        if let Ok(sz) = val.parse::<u64>() {
                            song.size = sz;
                        }
                    }
                    "format" => song.format = Some(val),
                    _ => {}
                }
            }
        }
    }

    if let Some(s) = current_song {
        songs.push(s);
    }

    Ok(songs)
}

// Fetch audio output devices configured in MPD
pub async fn get_outputs(
    host: &str,
    port: u16,
    password: Option<&str>,
) -> Result<Vec<MpdOutputDevice>, String> {
    let (mut reader, _) = connect_mpd(host, port, password, 3000).await?;
    let lines = execute_command(&mut reader, "outputs\n").await?;
    let mut outputs = Vec::new();
    let mut current_output: Option<MpdOutputDevice> = None;

    for line in lines {
        if let Some((k, v)) = line.split_once(": ") {
            let key = k.trim().to_lowercase();
            let val = v.trim().to_string();

            if key == "outputid" {
                if let Some(out) = current_output.take() {
                    outputs.push(out);
                }
                current_output = Some(MpdOutputDevice {
                    id: val.parse::<u32>().unwrap_or(0),
                    name: String::new(),
                    plugin: String::new(),
                    enabled: false,
                });
            } else if let Some(ref mut out) = current_output {
                match key.as_str() {
                    "outputname" => out.name = val,
                    "plugin" => out.plugin = val,
                    "outputenabled" => out.enabled = val == "1",
                    _ => {}
                }
            }
        }
    }

    if let Some(out) = current_output {
        outputs.push(out);
    }

    Ok(outputs)
}

// Auto-resolves MPD base directory from config (e.g. rootfs/mnt/SDCARD -> USB/rootfs/mnt/SDCARD)
pub async fn resolve_base_path(config: &MpdConfig) -> Result<String, String> {
    let (mut reader, _) = connect_mpd(&config.host, config.port, config.password.as_deref(), 3000).await?;
    
    let candidates = [
        config.path_strip_prefix.as_deref(),
        config.remote_mount_path.as_deref(),
    ];

    for cand_opt in candidates {
        if let Some(cand) = cand_opt {
            let clean = cand.replace('\\', "/").replace("smb://", "");
            let parts: Vec<&str> = clean.split('/').filter(|s| !s.is_empty()).collect();
            let desired = if cand.starts_with("smb://") && parts.len() >= 2 {
                parts[1..].join("/")
            } else {
                parts.join("/")
            };

            if desired.is_empty() {
                continue;
            }

            // Test 1: exact
            let cmd1 = format!("lsinfo \"{}\"\n", desired.replace('\"', "\\\""));
            if execute_command(&mut reader, &cmd1).await.is_ok() {
                return Ok(desired);
            }

            // Test 2: with USB/
            let cand_usb = format!("USB/{}", desired);
            let cmd2 = format!("lsinfo \"{}\"\n", cand_usb.replace('\"', "\\\""));
            if execute_command(&mut reader, &cmd2).await.is_ok() {
                return Ok(cand_usb);
            }

            // Test 3: check root dirs
            if let Ok(root_lines) = execute_command(&mut reader, "lsinfo\n").await {
                for line in root_lines {
                    if let Some((k, v)) = line.split_once(": ") {
                        if k.trim().to_lowercase() == "directory" {
                            let test_cand = format!("{}/{}", v.trim(), desired);
                            let test_cmd = format!("lsinfo \"{}\"\n", test_cand.replace('\"', "\\\""));
                            if execute_command(&mut reader, &test_cmd).await.is_ok() {
                                return Ok(test_cand);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(String::new())
}

// LAN auto-discovery: probes local subnet on port 6600
pub async fn discover_lan_servers() -> Vec<MpdDiscoveredServer> {
    let mut discovered = Vec::new();

    // 1. Probe localhost first
    if let Ok((mut r, version)) = connect_mpd("127.0.0.1", 6600, None, 150).await {
        let _ = execute_command(&mut r, "ping").await;
        discovered.push(MpdDiscoveredServer {
            host: "127.0.0.1".to_string(),
            port: 6600,
            version,
            name: "MPD Localhost (127.0.0.1)".to_string(),
        });
    }

    // 2. Discover local IP to find subnet base
    let local_ip = match std::net::UdpSocket::bind("0.0.0.0:0") {
        Ok(s) => match s.connect("8.8.8.8:80") {
            Ok(_) => s.local_addr().map(|a| a.ip()).ok(),
            Err(_) => None,
        },
        Err(_) => None,
    };

    if let Some(std::net::IpAddr::V4(ipv4)) = local_ip {
        let octets = ipv4.octets();
        let base_subnet = format!("{}.{}.{}", octets[0], octets[1], octets[2]);

        let mut tasks = Vec::new();
        // Probe IPs 1..254 concurrently in batches
        for i in 1..=254 {
            if i == octets[3] && !discovered.is_empty() {
                continue; // skip self if already probed
            }
            let ip_str = format!("{}.{}", base_subnet, i);
            tasks.push(tokio::spawn(async move {
                match connect_mpd(&ip_str, 6600, None, 280).await {
                    Ok((_, version)) => Some(MpdDiscoveredServer {
                        host: ip_str.clone(),
                        port: 6600,
                        version,
                        name: format!("MPD Servidor ({})", ip_str),
                    }),
                    Err(_) => None,
                }
            }));
        }

        for task in tasks {
            if let Ok(Some(server)) = task.await {
                // Deduplicate by host
                if !discovered.iter().any(|d| d.host == server.host) {
                    discovered.push(server);
                }
            }
        }
    }

    discovered
}

// ============================================================================
// MATCH & DIFF ENGINE (LOCAL VS MPD NETWORK DISK)
// ============================================================================

#[allow(dead_code)]
struct LocalMusicFile {
    relative_path: String,
    filename: String,
    size: u64,
    mtime: i64,
}

pub async fn compare_libraries(
    config: MpdConfig,
    local_music_dir: &str,
    subpath: Option<&str>,
) -> Result<LibraryDiffResult, String> {
    let local_base = Path::new(local_music_dir);
    if !local_base.exists() {
        return Err(format!(
            "La carpeta de música local no existe: {}",
            local_music_dir
        ));
    }

    // Step 1: Query remote MPD songs
    let mpd_songs = list_all_songs(
        &config.host,
        config.port,
        config.password.as_deref(),
        subpath,
    )
    .await?;

    // Determine candidate prefix to strip from MPD file paths (e.g. rootfs/mnt/SDCARD or USB/rootfs/mnt/SDCARD)
    let mut strip_pattern: Option<String> = None;
    for cand in [config.path_strip_prefix.as_deref(), config.remote_mount_path.as_deref()].into_iter().flatten() {
        let clean = cand.replace('\\', "/").replace("smb://", "");
        let parts: Vec<&str> = clean.split('/').filter(|s| !s.is_empty()).collect();
        if cand.starts_with("smb://") && parts.len() >= 2 {
            strip_pattern = Some(parts[1..].join("/"));
            break;
        } else if !parts.is_empty() {
            strip_pattern = Some(parts.join("/"));
            break;
        }
    }

    let mut mpd_map: HashMap<String, MpdSongItem> = HashMap::new();
    for song in mpd_songs {
        // FILTER: Keep only valid audio and cover image files
        if !is_audio_or_cover_file(&song.file) {
            continue;
        }

        let clean_file = song.file.replace('\\', "/").trim_start_matches('/').to_string();
        let norm_key = if let Some(ref pat) = strip_pattern {
            let pat_with_slash = format!("{}/", pat.trim_matches('/'));
            if let Some(idx) = clean_file.find(&pat_with_slash) {
                clean_file[idx + pat_with_slash.len()..].to_string()
            } else if clean_file.starts_with(pat.trim_matches('/')) {
                clean_file[pat.trim_matches('/').len()..].trim_start_matches('/').to_string()
            } else {
                clean_file
            }
        } else {
            clean_file
        };

        mpd_map.insert(norm_key, song);
    }

    // Step 2: Scan local library files
    let mut local_map: HashMap<String, LocalMusicFile> = HashMap::new();
    let local_scan_dir = match subpath {
        Some(p) if !p.trim().is_empty() => local_base.join(p),
        _ => local_base.to_path_buf(),
    };

    if local_scan_dir.exists() {
        for entry in jwalk::WalkDir::new(&local_scan_dir)
            .follow_links(false)
            .skip_hidden(true)
        {
            if let Ok(ent) = entry {
                if ent.file_type().is_file() {
                    let path = ent.path();
                    let path_str = path.to_string_lossy();
                    // FILTER: Keep only valid audio and cover image files
                    if is_audio_or_cover_file(&path_str) {
                        if let Ok(rel) = path.strip_prefix(local_base) {
                            let rel_str = rel
                                .to_string_lossy()
                                .replace('\\', "/")
                                .trim_start_matches('/')
                                .to_string();
                            let metadata = std::fs::metadata(&path).ok();
                            let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                            let mtime = metadata
                                .as_ref()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                                .map(|d| d.as_secs() as i64)
                                .unwrap_or(0);
                            let filename = path
                                .file_name()
                                .and_then(|f| f.to_str())
                                .unwrap_or(&rel_str)
                                .to_string();

                            local_map.insert(
                                rel_str.clone(),
                                LocalMusicFile {
                                    relative_path: rel_str,
                                    filename,
                                    size,
                                    mtime,
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    // Step 3: Match and categorize
    let mut all_keys: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for k in mpd_map.keys() {
        all_keys.insert(k.clone());
    }
    for k in local_map.keys() {
        all_keys.insert(k.clone());
    }

    let mut items = Vec::new();
    let mut count_in_sync = 0;
    let mut count_only_mpd = 0;
    let mut count_only_local = 0;
    let mut count_modified = 0;

    for key in all_keys {
        let mpd_opt = mpd_map.get(&key);
        let loc_opt = local_map.get(&key);

        let filename = Path::new(&key)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&key)
            .to_string();

        let title = mpd_opt
            .and_then(|m| m.title.clone())
            .unwrap_or_else(|| filename.replace(|c: char| c == '.' || c == '_', " "));
        let artist = mpd_opt
            .and_then(|m| m.artist.clone())
            .unwrap_or_else(|| "Desconocido".to_string());
        let album = mpd_opt
            .and_then(|m| m.album.clone())
            .unwrap_or_else(|| "Desconocido".to_string());
        let duration = mpd_opt.map(|m| m.duration).unwrap_or(0.0);
        let format = mpd_opt.and_then(|m| m.format.clone());

        match (mpd_opt, loc_opt) {
            (Some(mpd), Some(loc)) => {
                let mpd_mtime = mpd.last_modified_timestamp;
                let loc_mtime = loc.mtime;
                let size_diff = (mpd.size as i64 - loc.size as i64).abs();
                let time_diff = mpd_mtime - loc_mtime;

                // Threshold of 2 seconds for FAT/NTFS/ext4 timestamp differences
                let is_mtime_same = time_diff.abs() <= 2;
                let is_size_same = size_diff == 0;

                if is_mtime_same && is_size_same {
                    count_in_sync += 1;
                    items.push(LibraryDiffItem {
                        relative_path: key,
                        filename,
                        title,
                        artist,
                        album,
                        status: DiffStatus::InSync,
                        mpd_size: Some(mpd.size),
                        local_size: Some(loc.size),
                        mpd_mtime: Some(mpd_mtime),
                        local_mtime: Some(loc_mtime),
                        mpd_mtime_str: Some(format_timestamp(mpd_mtime)),
                        local_mtime_str: Some(format_timestamp(loc_mtime)),
                        newer_side: Some("same".to_string()),
                        time_diff_seconds: Some(0),
                        duration,
                        format,
                    });
                } else {
                    count_modified += 1;
                    let newer = if time_diff > 2 {
                        "mpd"
                    } else if time_diff < -2 {
                        "local"
                    } else {
                        "same"
                    };
                    items.push(LibraryDiffItem {
                        relative_path: key,
                        filename,
                        title,
                        artist,
                        album,
                        status: DiffStatus::Modified,
                        mpd_size: Some(mpd.size),
                        local_size: Some(loc.size),
                        mpd_mtime: Some(mpd_mtime),
                        local_mtime: Some(loc_mtime),
                        mpd_mtime_str: Some(format_timestamp(mpd_mtime)),
                        local_mtime_str: Some(format_timestamp(loc_mtime)),
                        newer_side: Some(newer.to_string()),
                        time_diff_seconds: Some(time_diff),
                        duration,
                        format,
                    });
                }
            }
            (Some(mpd), None) => {
                count_only_mpd += 1;
                items.push(LibraryDiffItem {
                    relative_path: key,
                    filename,
                    title,
                    artist,
                    album,
                    status: DiffStatus::OnlyMpd,
                    mpd_size: Some(mpd.size),
                    local_size: None,
                    mpd_mtime: Some(mpd.last_modified_timestamp),
                    local_mtime: None,
                    mpd_mtime_str: Some(format_timestamp(mpd.last_modified_timestamp)),
                    local_mtime_str: None,
                    newer_side: Some("mpd".to_string()),
                    time_diff_seconds: None,
                    duration,
                    format,
                });
            }
            (None, Some(loc)) => {
                count_only_local += 1;
                items.push(LibraryDiffItem {
                    relative_path: key,
                    filename,
                    title,
                    artist,
                    album,
                    status: DiffStatus::OnlyLocal,
                    mpd_size: None,
                    local_size: Some(loc.size),
                    mpd_mtime: None,
                    local_mtime: Some(loc.mtime),
                    mpd_mtime_str: None,
                    local_mtime_str: Some(format_timestamp(loc.mtime)),
                    newer_side: Some("local".to_string()),
                    time_diff_seconds: None,
                    duration,
                    format,
                });
            }
            (None, None) => {}
        }
    }

    Ok(LibraryDiffResult {
        total_mpd: mpd_map.len(),
        total_local: local_map.len(),
        count_in_sync,
        count_only_mpd,
        count_only_local,
        count_modified,
        items,
    })
}

// ============================================================================
// FILE TRANSFER (DOWNLOAD / UPLOAD WITH NETWORK MOUNT)
// ============================================================================

pub async fn transfer_files_direct(
    app_handle: &AppHandle,
    direction: &str, // "download_from_mpd" | "upload_to_mpd"
    relative_paths: Vec<String>,
    local_base_dir: &str,
    remote_mount_path: &str,
    mpd_config: Option<MpdConfig>,
) -> Result<usize, String> {
    let local_base = Path::new(local_base_dir);
    let remote_base = Path::new(remote_mount_path);

    if !remote_base.exists() {
        return Err(format!(
            "La ruta del disco en red montado no existe o no está montada: {}",
            remote_mount_path
        ));
    }

    let total_files = relative_paths.len();
    if total_files == 0 {
        return Ok(0);
    }

    let is_download = direction == "download_from_mpd";
    let mut copied_count = 0;
    let mut total_bytes = 0u64;

    let strip_prefix = mpd_config.as_ref().and_then(|c| c.path_strip_prefix.as_deref());

    // Resolve remote path (supporting smb:// mapping and prefix stripping)
    let resolve_remote = |rel_path: &str| -> std::path::PathBuf {
        let mut clean = rel_path.replace('\\', "/");
        if let Some(prefix) = strip_prefix {
            let p = prefix.trim().replace('\\', "/").trim_matches('/').to_string();
            if !p.is_empty() {
                if clean.starts_with(&format!("{}/", p)) {
                    clean = clean[p.len() + 1..].to_string();
                } else if clean.starts_with(&p) {
                    clean = clean[p.len()..].to_string();
                }
            }
        }
        let clean = clean.trim_start_matches('/').to_string();

        // Check if remote_mount_path is an smb:// url
        let mut base = remote_base.to_path_buf();
        let base_str = remote_mount_path.trim();
        if base_str.starts_with("smb://") {
            let without_scheme = &base_str[6..];
            let parts: Vec<&str> = without_scheme.split('/').collect();
            let server = parts.first().unwrap_or(&"");
            let share = parts.get(1).unwrap_or(&"");
            let subpath = if parts.len() > 2 { parts[2..].join("/") } else { String::new() };
            let gvfs_dir = format!("/run/user/1000/gvfs/smb-share:server={},share={}", server, share);
            let gvfs_path = std::path::PathBuf::from(if subpath.is_empty() { gvfs_dir } else { format!("{}/{}", gvfs_dir, subpath) });
            if gvfs_path.exists() {
                base = gvfs_path;
            }
        }

        // Smart overlap check: if base ends with first component of clean, avoid duplicating
        if let Some(first) = clean.split('/').next() {
            if !first.is_empty() && base.ends_with(first) {
                if let Some(after) = clean.strip_prefix(&format!("{}/", first)) {
                    return base.join(after);
                }
            }
        }

        base.join(&clean)
    };

    // Calculate total size first
    for rel in &relative_paths {
        let src = if is_download {
            resolve_remote(rel)
        } else {
            local_base.join(rel)
        };
        if let Ok(meta) = std::fs::metadata(&src) {
            total_bytes += meta.len();
        }
    }

    let mut bytes_copied = 0u64;

    for (idx, rel) in relative_paths.iter().enumerate() {
        let (src, dst) = if is_download {
            (resolve_remote(rel), local_base.join(rel))
        } else {
            (local_base.join(rel), resolve_remote(rel))
        };

        if !src.exists() {
            continue;
        }

        // Ensure destination parent directory exists
        if let Some(parent) = dst.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        // Copy file
        match std::fs::copy(&src, &dst) {
            Ok(file_sz) => {
                bytes_copied += file_sz;
                copied_count += 1;

                // Preserve modification timestamp
                if let Ok(src_meta) = std::fs::metadata(&src) {
                    if let Ok(src_mtime) = src_meta.modified() {
                        if let Ok(file) = File::options().write(true).open(&dst) {
                            let _ = file.set_times(std::fs::FileTimes::new().set_modified(src_mtime));
                        }
                    }
                }

                // Emit progress event
                let pct = if total_bytes > 0 {
                    (bytes_copied as f64 / total_bytes as f64) * 100.0
                } else {
                    ((idx + 1) as f64 / total_files as f64) * 100.0
                };

                let _ = app_handle.emit(
                    "mpd-transfer-progress",
                    MpdTransferProgress {
                        current_file: rel.clone(),
                        current_index: idx + 1,
                        total_files,
                        bytes_copied,
                        total_bytes,
                        percentage: pct.min(100.0),
                        status: "in_progress".to_string(),
                        error: None,
                    },
                );
            }
            Err(e) => {
                let _ = app_handle.emit(
                    "mpd-transfer-progress",
                    MpdTransferProgress {
                        current_file: rel.clone(),
                        current_index: idx + 1,
                        total_files,
                        bytes_copied,
                        total_bytes,
                        percentage: 0.0,
                        status: "error".to_string(),
                        error: Some(format!("Error copiando {}: {}", rel, e)),
                    },
                );
            }
        }
    }

    // Complete event
    let _ = app_handle.emit(
        "mpd-transfer-progress",
        MpdTransferProgress {
            current_file: "Finalizado".to_string(),
            current_index: total_files,
            total_files,
            bytes_copied,
            total_bytes,
            percentage: 100.0,
            status: "completed".to_string(),
            error: None,
        },
    );

    // If uploaded to MPD, trigger `update` command on MPD so it indexes the new files!
    if !is_download {
        if let Some(cfg) = mpd_config {
            let _ = send_playback_command(
                &cfg.host,
                cfg.port,
                cfg.password.as_deref(),
                "update",
                None,
            )
            .await;
        }
    }

    Ok(copied_count)
}

// ============================================================================
// TAURI COMMAND HANDLERS
// ============================================================================

#[tauri::command]
pub async fn mpd_get_status(
    host: String,
    port: u16,
    password: Option<String>,
) -> MpdServerStatus {
    ping_and_get_status(&host, port, password.as_deref()).await
}

#[tauri::command]
pub async fn mpd_discover_servers() -> Vec<MpdDiscoveredServer> {
    discover_lan_servers().await
}

#[tauri::command]
pub async fn mpd_list_directory(
    host: String,
    port: u16,
    password: Option<String>,
    path: String,
) -> Result<Vec<MpdDirectoryItem>, String> {
    list_directory(&host, port, password.as_deref(), &path).await
}

#[tauri::command]
pub async fn mpd_send_command(
    host: String,
    port: u16,
    password: Option<String>,
    command: String,
    arg: Option<String>,
) -> Result<String, String> {
    send_playback_command(&host, port, password.as_deref(), &command, arg.as_deref()).await
}

#[tauri::command]
pub async fn mpd_compare_libraries(
    config: MpdConfig,
    local_music_dir: String,
    subpath: Option<String>,
) -> Result<LibraryDiffResult, String> {
    compare_libraries(config, &local_music_dir, subpath.as_deref()).await
}

#[tauri::command]
pub async fn mpd_transfer_files(
    app: AppHandle,
    direction: String,
    relative_paths: Vec<String>,
    local_base_dir: String,
    remote_mount_path: String,
    mpd_config: Option<MpdConfig>,
) -> Result<usize, String> {
    transfer_files_direct(
        &app,
        &direction,
        relative_paths,
        &local_base_dir,
        &remote_mount_path,
        mpd_config,
    )
    .await
}

#[tauri::command]
pub fn mpd_save_config(
    app: AppHandle,
    config: MpdConfig,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state.audio.set_mpd_config(Some(config.clone()));
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&app_data_dir);
        let path = app_data_dir.join("mpd_config.json");
        if let Ok(json) = serde_json::to_string_pretty(&config) {
            let _ = std::fs::write(path, json);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn mpd_get_playlist_info(
    host: String,
    port: u16,
    password: Option<String>,
) -> Result<Vec<MpdSongItem>, String> {
    get_playlist_info(&host, port, password.as_deref()).await
}

#[tauri::command]
pub async fn mpd_get_outputs(
    host: String,
    port: u16,
    password: Option<String>,
) -> Result<Vec<MpdOutputDevice>, String> {
    get_outputs(&host, port, password.as_deref()).await
}

#[tauri::command]
pub async fn mpd_resolve_base_path(config: MpdConfig) -> Result<String, String> {
    resolve_base_path(&config).await
}

#[tauri::command]
pub async fn mpd_delete_item(
    target: String, // "local" | "remote"
    relative_path: String,
    is_directory: bool,
    config: Option<MpdConfig>,
    local_base_dir: Option<String>,
) -> Result<(), String> {
    let clean_rel = relative_path.replace('\\', "/").trim_matches('/').to_string();
    if clean_rel.is_empty() || clean_rel.contains("..") {
        return Err("Ruta no válida o no permitida".to_string());
    }

    if target == "local" {
        let base_str = local_base_dir.ok_or_else(|| "No se especificó la carpeta local".to_string())?;
        let base_path = Path::new(&base_str);
        if !base_path.exists() {
            return Err("La carpeta local no existe".to_string());
        }
        let target_path = base_path.join(&clean_rel);
        if !target_path.exists() {
            return Err(format!("El elemento local no existe: {:?}", target_path));
        }
        if is_directory {
            std::fs::remove_dir_all(&target_path)
                .map_err(|e| format!("Error al eliminar carpeta local: {}", e))?;
        } else {
            std::fs::remove_file(&target_path)
                .map_err(|e| format!("Error al eliminar archivo local: {}", e))?;
        }
        Ok(())
    } else {
        let cfg = config.ok_or_else(|| "No se proporcionó configuración MPD".to_string())?;
        
        // If mounted locally:
        if let Some(ref mount) = cfg.remote_mount_path {
            if !mount.starts_with("smb://") {
                let mount_path = Path::new(mount);
                if mount_path.exists() {
                    let target_path = mount_path.join(&clean_rel);
                    if target_path.exists() {
                        if is_directory {
                            std::fs::remove_dir_all(&target_path)
                                .map_err(|e| format!("Error al eliminar carpeta remota: {}", e))?;
                        } else {
                            std::fs::remove_file(&target_path)
                                .map_err(|e| format!("Error al eliminar archivo remoto: {}", e))?;
                        }
                        let _ = send_playback_command(&cfg.host, cfg.port, cfg.password.as_deref(), "update", None).await;
                        return Ok(());
                    }
                }
            }
        }

        // Remote deletion via smbclient
        let host = cfg.host.as_str();
        let user = cfg.smb_user.as_deref();
        let pass = cfg.smb_password.as_deref();
        let domain = cfg.smb_domain.as_deref();

        let (server, share, rel_in_share) = if let Some(ref cand) = cfg.remote_mount_path.as_ref().or(cfg.path_strip_prefix.as_ref()) {
            if cand.starts_with("smb://") {
                let without = cand.trim_start_matches("smb://");
                let parts: Vec<&str> = without.split('/').filter(|s| !s.is_empty()).collect();
                let srv = parts.first().copied().unwrap_or(host).to_string();
                let sh = parts.get(1).copied().unwrap_or("rootfs").to_string();
                let base_sub = if parts.len() > 2 { parts[2..].join("/") } else { String::new() };
                let full_rel = if base_sub.is_empty() {
                    clean_rel.clone()
                } else if clean_rel.starts_with(&base_sub) {
                    clean_rel.clone()
                } else {
                    format!("{}/{}", base_sub.trim_matches('/'), clean_rel.trim_matches('/'))
                };
                (srv, sh, full_rel)
            } else {
                (host.to_string(), "rootfs".to_string(), clean_rel.clone())
            }
        } else {
            (host.to_string(), "rootfs".to_string(), clean_rel.clone())
        };

        let smb_target = format!("//{}/{}", server, share);
        let mut cmd = std::process::Command::new("smbclient");
        cmd.arg(&smb_target);
        if let Some(u) = user {
            if let Some(p) = pass {
                cmd.arg("-U").arg(format!("{}%{}", u, p));
            } else {
                cmd.arg("-U").arg(u);
            }
        } else {
            cmd.arg("-N");
        }
        if let Some(d) = domain {
            cmd.arg("-W").arg(d);
        }

        let smb_action = if is_directory {
            format!("rmdir \"{}\"", rel_in_share.replace('\"', "\\\""))
        } else {
            format!("del \"{}\"", rel_in_share.replace('\"', "\\\""))
        };
        cmd.arg("-c").arg(&smb_action);

        let output = cmd.output().map_err(|e| format!("Error al invocar smbclient para borrar: {}", e))?;
        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Error de smbclient al eliminar: {}", err_msg.trim()));
        }

        // Trigger MPD update so the removed item disappears from database
        let _ = send_playback_command(&cfg.host, cfg.port, cfg.password.as_deref(), "update", None).await;
        Ok(())
    }
}

/// Resolves a remote MPD or SMB track into a local cached audio file
pub fn resolve_and_fetch_smb_file(
    path_str: &str,
    config: Option<&MpdConfig>,
) -> Result<std::path::PathBuf, String> {
    let p = std::path::Path::new(path_str);
    if p.exists() {
        return Ok(p.to_path_buf());
    }

    // Attempt to load fallback config from disk if none was provided
    let fallback_cfg: Option<MpdConfig> = if config.is_none() {
        let app_dir = std::env::var("HOME").ok().map(|h| {
            std::path::PathBuf::from(h)
                .join(".local/share/com.musicx.audioplayer/mpd_config.json")
        });
        if let Some(p) = app_dir {
            if p.exists() {
                std::fs::read_to_string(&p)
                    .ok()
                    .and_then(|c| serde_json::from_str(&c).ok())
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    let effective_cfg = config.or(fallback_cfg.as_ref());

    // Determine host, credentials, and domain
    let host = effective_cfg.map(|c| c.host.as_str()).unwrap_or("127.0.0.1");
    let smb_user = effective_cfg.and_then(|c| c.smb_user.as_deref());
    let smb_pass = effective_cfg.and_then(|c| c.smb_password.as_deref());
    let smb_domain = effective_cfg.and_then(|c| c.smb_domain.as_deref());

    // Clean up path
    let clean_path = path_str.replace('\\', "/");

    let (server, share, rel_in_share) = if clean_path.starts_with("smb://") {
        let without_scheme = clean_path.trim_start_matches("smb://");
        let parts: Vec<&str> = without_scheme.split('/').filter(|s| !s.is_empty()).collect();
        let srv = parts.first().copied().unwrap_or(host).to_string();
        let sh = parts.get(1).copied().unwrap_or("rootfs").to_string();
        let sub = if parts.len() > 2 {
            parts[2..].join("/")
        } else {
            String::new()
        };
        (srv, sh, sub)
    } else {
        // If config has remote_mount_path or path_strip_prefix with smb://, parse server & share
        let mut srv = host.to_string();
        let mut sh = "rootfs".to_string();
        let mut base_subpath = String::new();

        let smb_candidate = effective_cfg.and_then(|c| {
            if c.remote_mount_path.as_deref().unwrap_or("").starts_with("smb://") {
                c.remote_mount_path.as_deref()
            } else if c.path_strip_prefix.as_deref().unwrap_or("").starts_with("smb://") {
                c.path_strip_prefix.as_deref()
            } else {
                None
            }
        });

        if let Some(cand) = smb_candidate {
            let without = cand.trim_start_matches("smb://");
            let parts: Vec<&str> = without.split('/').filter(|s| !s.is_empty()).collect();
            if let Some(s) = parts.first() { srv = s.to_string(); }
            if let Some(s) = parts.get(1) { sh = s.to_string(); }
            if parts.len() > 2 {
                base_subpath = parts[2..].join("/");
            }
        }

        // Relative path extraction
        // E.g. clean_path: "USB/rootfs/mnt/SDCARD/RAP/El Niño Snake/..."
        let pattern = format!("{}/", sh);
        let sub = if let Some(idx) = clean_path.find(&pattern) {
            clean_path[idx + pattern.len()..].to_string()
        } else if let Some(prefix) = effective_cfg.and_then(|c| c.path_strip_prefix.as_deref()) {
            let p_clean = prefix.replace('\\', "/").trim_matches('/').to_string();
            if !p_clean.is_empty() && clean_path.starts_with(&p_clean) {
                clean_path[p_clean.len()..].trim_start_matches('/').to_string()
            } else if !base_subpath.is_empty() && !clean_path.starts_with(&base_subpath) {
                format!("{}/{}", base_subpath.trim_matches('/'), clean_path.trim_start_matches('/'))
            } else {
                clean_path.trim_start_matches('/').to_string()
            }
        } else if !base_subpath.is_empty() && !clean_path.starts_with(&base_subpath) {
            format!("{}/{}", base_subpath.trim_matches('/'), clean_path.trim_start_matches('/'))
        } else {
            clean_path.trim_start_matches('/').to_string()
        };

        (srv, sh, sub)
    };

    if rel_in_share.is_empty() {
        return Err(format!("No se pudo determinar la ruta relativa en el recurso SMB: {}", path_str));
    }

    // Cache destination
    let cache_dir = std::env::temp_dir().join("musicx_smb_cache");
    let _ = std::fs::create_dir_all(&cache_dir);

    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path_str.hash(&mut hasher);
    let hash_val = hasher.finish();

    let ext = std::path::Path::new(&rel_in_share)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("flac");
    let file_name = std::path::Path::new(&rel_in_share)
        .file_stem()
        .and_then(|f| f.to_str())
        .unwrap_or("track");

    let safe_stem: String = file_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .take(64)
        .collect();

    let cache_file = cache_dir.join(format!("{:016x}_{}.{}", hash_val, safe_stem, ext));

    // If cache file exists and has size > 1024 bytes, return it immediately!
    if cache_file.exists() {
        if let Ok(meta) = std::fs::metadata(&cache_file) {
            if meta.len() > 1024 {
                return Ok(cache_file);
            }
        }
    }

    // Download via smbclient
    let smb_target = format!("//{}/{}", server, share);
    let mut cmd = std::process::Command::new("smbclient");
    cmd.arg(&smb_target);

    if let Some(user) = smb_user {
        if let Some(pass) = smb_pass {
            cmd.arg("-U").arg(format!("{}%{}", user, pass));
        } else {
            cmd.arg("-U").arg(user);
        }
    } else {
        cmd.arg("-N");
    }

    if let Some(domain) = smb_domain {
        cmd.arg("-W").arg(domain);
    }

    let clean_rel = rel_in_share.trim_start_matches('/');
    let smb_get_cmd = format!("get \"{}\" \"{}\"", clean_rel.replace('\"', "\\\""), cache_file.to_string_lossy());
    cmd.arg("-c").arg(&smb_get_cmd);

    let output = cmd.output().map_err(|e| format!("Error al invocar smbclient: {}", e))?;
    let mut success = output.status.success();
    let mut smb_err = String::from_utf8_lossy(&output.stderr).to_string();

    // If failed and server is a hostname, retry with host IP
    if !success && server != host {
        let smb_target_host = format!("//{}/{}", host, share);
        let mut retry_cmd = std::process::Command::new("smbclient");
        retry_cmd.arg(&smb_target_host);

        if let Some(user) = smb_user {
            if let Some(pass) = smb_pass {
                retry_cmd.arg("-U").arg(format!("{}%{}", user, pass));
            } else {
                retry_cmd.arg("-U").arg(user);
            }
        } else {
            retry_cmd.arg("-N");
        }

        if let Some(domain) = smb_domain {
            retry_cmd.arg("-W").arg(domain);
        }

        retry_cmd.arg("-c").arg(&smb_get_cmd);
        if let Ok(retry_out) = retry_cmd.output() {
            if retry_out.status.success() {
                success = true;
            } else {
                smb_err = String::from_utf8_lossy(&retry_out.stderr).to_string();
            }
        }
    }

    if !success {
        // Fallback to curl if smbclient failed
        let user_pass = match (smb_user, smb_pass) {
            (Some(u), Some(p)) => format!("{}:{}", u, p),
            (Some(u), None) => u.to_string(),
            _ => String::new(),
        };

        let encoded_sub = clean_rel.split('/')
            .map(|seg| urlencoding_segment(seg))
            .collect::<Vec<_>>()
            .join("/");
        let curl_url = format!("smb://{}/{}/{}", server, share, encoded_sub);

        let mut curl_cmd = std::process::Command::new("curl");
        curl_cmd.arg("-s");
        if !user_pass.is_empty() {
            curl_cmd.arg("-u").arg(&user_pass);
        }
        curl_cmd.arg(&curl_url).arg("-o").arg(&cache_file);

        let curl_out = curl_cmd.output();
        let curl_success = curl_out.as_ref().map(|o| o.status.success()).unwrap_or(false);

        if !curl_success || !cache_file.exists() || std::fs::metadata(&cache_file).map(|m| m.len()).unwrap_or(0) == 0 {
            let _ = std::fs::remove_file(&cache_file);
            return Err(format!("smbclient falló: {}", smb_err.trim()));
        }
    }

    if cache_file.exists() && std::fs::metadata(&cache_file).map(|m| m.len() > 0).unwrap_or(false) {
        eprintln!("[musicx smb] Pista remota descargada y cacheada con éxito: {:?}", cache_file);
        Ok(cache_file)
    } else {
        Err(format!("El archivo descargado de SMB está vacío o no se guardó: {:?}", cache_file))
    }
}

fn urlencoding_segment(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}


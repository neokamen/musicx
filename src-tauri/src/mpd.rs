use chrono::{DateTime, NaiveDateTime};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::path::Path;
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
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
    pub http_stream_url: Option<String>,
}

impl Default for MpdConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 6600,
            password: None,
            remote_mount_path: None,
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

// List contents of a remote directory via `lsinfo`
pub async fn list_directory(
    host: &str,
    port: u16,
    password: Option<&str>,
    dir_path: &str,
) -> Result<Vec<MpdDirectoryItem>, String> {
    let (mut reader, _) = connect_mpd(host, port, password, 3000).await?;

    let cmd = if dir_path.trim().is_empty() {
        "lsinfo\n".to_string()
    } else {
        format!("lsinfo \"{}\"\n", dir_path.replace('\"', "\\\""))
    };

    let lines = execute_command(&mut reader, &cmd).await?;
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
        ("add", Some(uri)) => format!("add \"{}\"\n", uri.replace('\"', "\\\"")),
        ("delete", Some(pos)) => format!("delete {}\n", pos),
        ("clear", _) => "clear\n".to_string(),
        ("update", Some(uri)) => format!("update \"{}\"\n", uri.replace('\"', "\\\"")),
        ("update", None) => "update\n".to_string(),
        _ => return Err(format!("Comando desconocido: {}", command)),
    };

    execute_command(&mut reader, &cmd_str).await?;
    Ok("OK".to_string())
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

    let mut mpd_map: HashMap<String, MpdSongItem> = HashMap::new();
    for song in mpd_songs {
        let norm_key = song.file.replace('\\', "/").trim_start_matches('/').to_string();
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
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    if matches!(
                        ext.as_str(),
                        "mp3" | "flac" | "wav" | "ogg" | "m4a" | "aac" | "opus" | "alac" | "wma" | "aiff"
                    ) {
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

    // Calculate total size first
    for rel in &relative_paths {
        let src = if is_download {
            remote_base.join(rel)
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
            (remote_base.join(rel), local_base.join(rel))
        } else {
            (local_base.join(rel), remote_base.join(rel))
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


use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtDlpInfo {
    pub version: String,
    pub path: String,
    pub node_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeToolStatus {
    pub name: String,
    pub installed: bool,
    pub version: String,
    pub path: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeDepsStatus {
    pub os: String,
    pub os_label: String,
    pub distro_id: String,
    pub distro_name: String,
    pub package_family: String,
    pub package_manager: String,
    pub hint: String,
    pub ytdlp: RuntimeToolStatus,
    pub ffmpeg: RuntimeToolStatus,
    pub node_available: bool,
}

fn exe_suffix() -> &'static str {
    if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    }
}

fn musicx_user_bin_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("LOCALAPPDATA")
            .or_else(|_| std::env::var("APPDATA"))
            .unwrap_or_else(|_| "C:\\ProgramData".into());
        PathBuf::from(base).join("musicx").join("bin")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        PathBuf::from(home).join(".local").join("bin")
    }
}

fn candidate_tool_paths(name: &str) -> Vec<PathBuf> {
    let file = format!("{}{}", name, exe_suffix());
    let mut paths = Vec::new();

    paths.push(musicx_user_bin_dir().join(&file));

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if name == "yt-dlp" {
                paths.push(dir.join(format!("neo-yt-dlp{}", exe_suffix())));
            }
            paths.push(dir.join(&file));
        }
    }

    #[cfg(target_os = "windows")]
    {
        for env_key in ["LOCALAPPDATA", "APPDATA"] {
            if let Ok(base) = std::env::var(env_key) {
                paths.push(PathBuf::from(base).join("soundix").join("bin").join(&file));
            }
        }
    }

    paths
}

async fn command_in_path(name: &str) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let output = Command::new("where").arg(name).output().await;
    #[cfg(not(target_os = "windows"))]
    let output = Command::new("which").arg(name).output().await;

    let Ok(out) = output else { return None };
    if !out.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if line.is_empty() {
        return None;
    }
    Some(PathBuf::from(line))
}

pub fn get_yt_dlp_binary() -> PathBuf {
    for path in candidate_tool_paths("yt-dlp") {
        if path.exists() {
            return path;
        }
    }
    PathBuf::from(format!("yt-dlp{}", exe_suffix()))
}

pub fn get_ffmpeg_binary() -> PathBuf {
    for path in candidate_tool_paths("ffmpeg") {
        if path.exists() {
            return path;
        }
    }
    PathBuf::from(format!("ffmpeg{}", exe_suffix()))
}

pub fn deps_bin_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![musicx_user_bin_dir()];
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
        }
    }
    dirs
}

pub fn apply_deps_path(cmd: &mut Command) {
    let mut parts: Vec<String> = deps_bin_dirs()
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    if let Ok(existing) = std::env::var("PATH").or_else(|_| std::env::var("Path")) {
        parts.push(existing);
    }
    let joined = parts.join(if cfg!(target_os = "windows") { ";" } else { ":" });
    cmd.env("PATH", &joined);
    cmd.env("Path", &joined);
}

pub fn spawn_ytdlp() -> Command {
    let mut cmd = Command::new(get_yt_dlp_binary());
    apply_deps_path(&mut cmd);
    cmd
}

pub fn spawn_ffmpeg() -> Command {
    let mut cmd = Command::new(get_ffmpeg_binary());
    apply_deps_path(&mut cmd);
    cmd
}

pub async fn ensure_runtime_deps() -> Result<(), String> {
    static LOCK: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();
    let lock = LOCK.get_or_init(|| tokio::sync::Mutex::new(()));
    let _guard = lock.lock().await;

    let ytdlp = resolve_tool("yt-dlp", &["--version"]).await;
    if !ytdlp.installed {
        try_auto_update_ytdlp().await?;
    }

    let ffmpeg = resolve_tool("ffmpeg", &["-version"]).await;
    if !ffmpeg.installed {
        if let Err(error) = download_portable_ffmpeg().await {
            #[cfg(target_os = "windows")]
            {
                return Err(error);
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = error;
            }
        }
    }
    Ok(())
}

pub fn get_yt_dlp_install_target_path() -> PathBuf {
    musicx_user_bin_dir().join(format!("yt-dlp{}", exe_suffix()))
}

fn ffmpeg_install_target_path() -> PathBuf {
    musicx_user_bin_dir().join(format!("ffmpeg{}", exe_suffix()))
}

fn parse_os_release() -> (String, String) {
    let Ok(raw) = std::fs::read_to_string("/etc/os-release") else {
        return (String::new(), String::new());
    };
    let mut id = String::new();
    let mut name = String::new();
    for line in raw.lines() {
        if let Some(value) = line.strip_prefix("ID=") {
            id = value.trim_matches('"').to_string();
        } else if let Some(value) = line.strip_prefix("NAME=") {
            name = value.trim_matches('"').to_string();
        }
    }
    (id, name)
}

fn classify_platform() -> (String, String, String, String, String, String) {
    #[cfg(target_os = "windows")]
    {
        return (
            "windows".into(),
            "Windows".into(),
            "windows".into(),
            "Windows".into(),
            "windows".into(),
            "winget".into(),
        );
    }

    #[cfg(target_os = "macos")]
    {
        return (
            "macos".into(),
            "macOS".into(),
            "macos".into(),
            "macOS".into(),
            "macos".into(),
            "brew".into(),
        );
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let (id, name) = parse_os_release();
        let id_l = id.to_lowercase();
        let (family, manager) = match id_l.as_str() {
            "fedora" | "rhel" | "centos" | "rocky" | "almalinux" | "nobara" | "ultramarine" => {
                ("rpm", "dnf")
            }
            "opensuse-tumbleweed" | "opensuse-leap" | "opensuse" | "sles" => ("rpm", "zypper"),
            "mageia" | "openmandriva" => ("rpm", "dnf"),
            "debian" | "ubuntu" | "linuxmint" | "pop" | "elementary" | "zorin" | "kali" | "raspbian" => {
                ("deb", "apt")
            }
            "arch" | "manjaro" | "endeavouros" | "cachyos" | "garuda" => ("pacman", "pacman"),
            "alpine" => ("apk", "apk"),
            "gentoo" => ("portage", "emerge"),
            "nixos" => ("nix", "nix-env"),
            _ if Path::new("/usr/bin/dnf").exists() || Path::new("/usr/bin/rpm").exists() => ("rpm", "dnf"),
            _ if Path::new("/usr/bin/apt-get").exists() || Path::new("/usr/bin/dpkg").exists() => {
                ("deb", "apt")
            }
            _ => ("linux", "unknown"),
        };
        let label = if name.is_empty() { "Linux".into() } else { name.clone() };
        (
            "linux".into(),
            label,
            id,
            if name.is_empty() { id_l } else { name },
            family.into(),
            manager.into(),
        )
    }
}

fn platform_hint(os: &str, family: &str, manager: &str, distro_name: &str) -> String {
    match (os, family) {
        ("windows", _) => {
            "Windows: el instalador lleva yt-dlp, ffmpeg y ffprobe. Si faltan, se descargan a %LOCALAPPDATA%\\musicx\\bin. No uses pip ni Python Store.".into()
        }
        ("macos", _) => {
            "En macOS lo más estable es brew install ffmpeg yt-dlp. Si no hay Homebrew, MusicX puede dejar binarios de usuario.".into()
        }
        (_, "rpm") => format!(
            "{distro_name} ({manager}): el paquete de MusicX incluye yt-dlp. ffmpeg se usa del sistema o se baja a ~/.local/bin al primer uso. RPM Fusion no es obligatorio."
        ),
        (_, "deb") => format!(
            "{distro_name} ({manager}): ffmpeg está en los repos. yt-dlp de apt suele ser viejo; MusicX instala el binario oficial en ~/.local/bin. Puedes instalar ffmpeg del sistema con: sudo apt install ffmpeg"
        ),
        (_, "pacman") => format!(
            "{distro_name}: sudo pacman -S ffmpeg yt-dlp. Si faltan, MusicX puede dejar binarios en ~/.local/bin."
        ),
        _ => "MusicX instalará yt-dlp y ffmpeg en ~/.local/bin si no están en el PATH.".into(),
    }
}

async fn tool_version(bin: &Path, args: &[&str]) -> String {
    match Command::new(bin).args(args).output().await {
        Ok(out) if out.status.success() => {
            let text = if out.stdout.is_empty() {
                String::from_utf8_lossy(&out.stderr)
            } else {
                String::from_utf8_lossy(&out.stdout)
            };
            text.lines()
                .next()
                .unwrap_or("Desconocida")
                .trim()
                .chars()
                .take(80)
                .collect()
        }
        _ => "No disponible".into(),
    }
}

fn source_for_path(path: &Path) -> String {
    let rendered = path.to_string_lossy();
    if rendered == format!("yt-dlp{}", exe_suffix()) || rendered == format!("ffmpeg{}", exe_suffix()) {
        return "ausente".into();
    }
    if path.starts_with(musicx_user_bin_dir()) {
        return "usuario".into();
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if path.starts_with(dir) {
                return "empaquetado".into();
            }
        }
    }
    if rendered.contains("soundix") {
        return "usuario (legacy)".into();
    }
    "sistema".into()
}

async fn resolve_tool(name: &str, version_args: &[&str]) -> RuntimeToolStatus {
    let mut path = if name == "yt-dlp" {
        get_yt_dlp_binary()
    } else {
        get_ffmpeg_binary()
    };
    if !path.exists() {
        if let Some(found) = command_in_path(name).await {
            path = found;
        }
    }
    let installed = path.exists()
        || Command::new(&path)
            .args(version_args)
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false);
    let version = if installed {
        tool_version(&path, version_args).await
    } else {
        "No instalado".into()
    };
    RuntimeToolStatus {
        name: name.into(),
        installed,
        version,
        path: path.to_string_lossy().to_string(),
        source: if installed { source_for_path(&path) } else { "ausente".into() },
    }
}

async fn node_available() -> bool {
    Path::new("/usr/bin/node").exists()
        || command_in_path("node").await.is_some()
}

pub async fn download_standalone_ytdlp() -> Result<String, String> {
    let target = get_yt_dlp_install_target_path();
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Error creando directorio: {e}"))?;
    }

    #[cfg(target_os = "windows")]
    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
    #[cfg(not(target_os = "windows"))]
    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

    download_file(url, &target).await?;
    make_executable(&target).await?;
    Ok(format!("yt-dlp instalado en {}", target.display()))
}

async fn download_file(url: &str, target: &Path) -> Result<(), String> {
    let mut resp = reqwest::get(url)
        .await
        .map_err(|e| format!("Error conectando a {url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Descarga fallida ({}) {url}", resp.status()));
    }
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Error creando directorio: {e}"))?;
    }
    let mut file = tokio::fs::File::create(target)
        .await
        .map_err(|e| format!("Error creando {}: {e}", target.display()))?;
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Error leyendo descarga: {e}"))?
    {
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| format!("Error escribiendo {}: {e}", target.display()))?;
    }
    Ok(())
}

async fn make_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(path)
            .await
            .map_err(|e| e.to_string())?
            .permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(path, perms)
            .await
            .map_err(|e| e.to_string())?;
    }
    let _ = path;
    Ok(())
}

fn ffmpeg_archive_url() -> Result<&'static str, String> {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        return Ok("https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip");
    }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        return Ok("https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-winarm64-gpl-shared.zip");
    }
    #[cfg(all(not(target_os = "windows"), target_arch = "x86_64"))]
    {
        return Ok("https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz");
    }
    #[cfg(all(not(target_os = "windows"), target_arch = "aarch64"))]
    {
        return Ok("https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz");
    }
    #[allow(unreachable_code)]
    Err("No hay paquete ffmpeg portátil para esta arquitectura.".into())
}

async fn find_named_file(root: &Path, file_name: &str) -> Option<PathBuf> {
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(mut entries) = tokio::fs::read_dir(&dir).await else { continue };
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            let Ok(kind) = entry.file_type().await else { continue };
            if kind.is_dir() {
                stack.push(path);
            } else if kind.is_file() && entry.file_name() == file_name {
                return Some(path);
            }
        }
    }
    None
}

async fn download_portable_ffmpeg() -> Result<String, String> {
    let url = ffmpeg_archive_url()?;
    let bin_dir = musicx_user_bin_dir();
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|e| format!("Error creando {}: {e}", bin_dir.display()))?;

    let tmp_dir = bin_dir.join(".tmp-ffmpeg");
    let _ = tokio::fs::remove_dir_all(&tmp_dir).await;
    tokio::fs::create_dir_all(&tmp_dir)
        .await
        .map_err(|e| format!("Error creando temporal: {e}"))?;

    let archive_name = if url.ends_with(".zip") {
        "ffmpeg.zip"
    } else {
        "ffmpeg.tar.xz"
    };
    let archive = tmp_dir.join(archive_name);
    download_file(url, &archive).await?;

    let extract_dir = tmp_dir.join("extract");
    tokio::fs::create_dir_all(&extract_dir)
        .await
        .map_err(|e| format!("Error creando extracto: {e}"))?;

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!(
                    "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                    archive.display(),
                    extract_dir.display()
                ),
            ])
            .status()
            .await
            .map_err(|e| format!("PowerShell no pudo extraer ffmpeg: {e}"))?;
        if !status.success() {
            return Err("Falló Expand-Archive. Comprueba que PowerShell puede extraer el zip de ffmpeg.".into());
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("tar")
            .args(["-xJf", &archive.to_string_lossy(), "-C", &extract_dir.to_string_lossy()])
            .status()
            .await
            .map_err(|e| format!("tar no pudo extraer ffmpeg: {e}"))?;
        if !status.success() {
            return Err("Falló tar -xJf. Instala xz/tar o ffmpeg de tu distro.".into());
        }
    }

    let ffmpeg_name = format!("ffmpeg{}", exe_suffix());
    let ffprobe_name = format!("ffprobe{}", exe_suffix());
    let ffmpeg_src = find_named_file(&extract_dir, &ffmpeg_name)
        .await
        .ok_or_else(|| "El archivo extraído no contiene ffmpeg.".to_string())?;
    let dest = ffmpeg_install_target_path();
    tokio::fs::copy(&ffmpeg_src, &dest)
        .await
        .map_err(|e| format!("No se pudo copiar ffmpeg: {e}"))?;
    make_executable(&dest).await?;

    if let Some(ffprobe_src) = find_named_file(&extract_dir, &ffprobe_name).await {
        let probe_dest = bin_dir.join(&ffprobe_name);
        let _ = tokio::fs::copy(&ffprobe_src, &probe_dest).await;
        let _ = make_executable(&probe_dest).await;
    }

    let _ = tokio::fs::remove_dir_all(&tmp_dir).await;
    Ok(format!("ffmpeg instalado en {}", dest.display()))
}

pub fn append_modern_ytdlp_args(args: &mut Vec<String>) {
    args.push("--no-update".into());
    args.push("--user-agent".into());
    args.push("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".into());
    args.push("--extractor-args".into());
    args.push("youtube:player_client=web,default".into());

    let has_node = Path::new("/usr/bin/node").exists()
        || std::process::Command::new(if cfg!(target_os = "windows") { "where" } else { "which" })
            .arg("node")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

    if has_node {
        args.push("--js-runtimes".into());
        args.push("node".into());
        args.push("--remote-components".into());
        args.push("ejs:github".into());
    }
}

pub async fn try_auto_update_ytdlp() -> Result<String, String> {
    download_standalone_ytdlp().await
}

#[tauri::command]
pub async fn get_ytdlp_info() -> Result<YtDlpInfo, String> {
    let status = resolve_tool("yt-dlp", &["--version"]).await;
    Ok(YtDlpInfo {
        version: status.version,
        path: status.path,
        node_available: node_available().await,
    })
}

#[tauri::command]
pub async fn update_ytdlp() -> Result<String, String> {
    try_auto_update_ytdlp().await
}

#[tauri::command]
pub async fn get_runtime_deps_status() -> Result<RuntimeDepsStatus, String> {
    let (os, os_label, distro_id, distro_name, family, manager) = classify_platform();
    let hint = platform_hint(&os, &family, &manager, &distro_name);
    let ytdlp = resolve_tool("yt-dlp", &["--version"]).await;
    let ffmpeg = resolve_tool("ffmpeg", &["-version"]).await;
    Ok(RuntimeDepsStatus {
        os,
        os_label,
        distro_id,
        distro_name,
        package_family: family,
        package_manager: manager,
        hint,
        ytdlp,
        ffmpeg,
        node_available: node_available().await,
    })
}

#[tauri::command]
pub async fn install_or_update_runtime_deps() -> Result<String, String> {
    let mut notes = Vec::new();
    match try_auto_update_ytdlp().await {
        Ok(msg) => notes.push(msg),
        Err(err) => notes.push(format!("yt-dlp: {err}")),
    }
    match download_portable_ffmpeg().await {
        Ok(msg) => notes.push(msg),
        Err(err) => notes.push(format!("ffmpeg: {err}")),
    }

    let ytdlp = resolve_tool("yt-dlp", &["--version"]).await;
    let ffmpeg = resolve_tool("ffmpeg", &["-version"]).await;
    if !ytdlp.installed && !ffmpeg.installed {
        return Err(notes.join(" "));
    }
    Ok(format!(
        "{}\n\nyt-dlp: {} ({})\nffmpeg: {} ({})",
        notes.join("\n"),
        ytdlp.version,
        ytdlp.path,
        ffmpeg.version,
        ffmpeg.path
    ))
}

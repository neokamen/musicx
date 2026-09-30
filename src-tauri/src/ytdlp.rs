use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtDlpInfo {
    pub version: String,
    pub path: String,
    pub node_available: bool,
}

pub fn get_yt_dlp_binary() -> PathBuf {
    let exe_ext = if cfg!(target_os = "windows") { ".exe" } else { "" };

    // 1. Check sidecar / exe directory (neo-yt-dlp or yt-dlp)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let neo = dir.join(format!("neo-yt-dlp{exe_ext}"));
            if neo.exists() {
                return neo;
            }
            let standard = dir.join(format!("yt-dlp{exe_ext}"));
            if standard.exists() {
                return standard;
            }
        }
    }

    // 2. Check local user app data / home bin directory
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let p = PathBuf::from(&appdata).join("soundix").join("bin").join("yt-dlp.exe");
            if p.exists() {
                return p;
            }
        }
        if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(&localappdata).join("soundix").join("bin").join("yt-dlp.exe");
            if p.exists() {
                return p;
            }
        }
    }

    let home = std::env::var("HOME").unwrap_or_default();
    let local_bin = PathBuf::from(&home).join(".local").join("bin").join("yt-dlp");
    if local_bin.exists() {
        return local_bin;
    }

    PathBuf::from(format!("yt-dlp{exe_ext}"))
}

pub fn get_yt_dlp_install_target_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("APPDATA")
            .or_else(|_| std::env::var("LOCALAPPDATA"))
            .unwrap_or_else(|_| "C:\\ProgramData".into());
        PathBuf::from(base).join("soundix").join("bin").join("yt-dlp.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        PathBuf::from(home).join(".local").join("bin").join("yt-dlp")
    }
}

pub async fn download_standalone_ytdlp() -> Result<String, String> {
    let target = get_yt_dlp_install_target_path();
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| format!("Error creando directorio: {e}"))?;
    }

    #[cfg(target_os = "windows")]
    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
    #[cfg(not(target_os = "windows"))]
    let url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

    let resp = reqwest::get(url).await.map_err(|e| format!("Error conectando para descargar yt-dlp: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Servidor devolvió código HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Error descargando archivo: {e}"))?;
    tokio::fs::write(&target, &bytes).await.map_err(|e| format!("Error guardando yt-dlp: {e}"))?;

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(&target).await.map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o755);
        let _ = tokio::fs::set_permissions(&target, perms).await;
    }

    Ok(format!("yt-dlp instalado exitosamente en {}", target.display()))
}

pub fn append_modern_ytdlp_args(args: &mut Vec<String>) {
    args.push("--no-update".into());
    args.push("--user-agent".into());
    args.push("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".into());
    args.push("--extractor-args".into());
    args.push("youtube:player_client=web,default".into());

    let has_node = if std::path::Path::new("/usr/bin/node").exists() {
        true
    } else {
        #[cfg(target_os = "windows")]
        let check_cmd = "where";
        #[cfg(not(target_os = "windows"))]
        let check_cmd = "which";
        std::process::Command::new(check_cmd).arg("node").output().map(|o| o.status.success()).unwrap_or(false)
    };

    if has_node {
        args.push("--js-runtimes".into());
        args.push("node".into());
        args.push("--remote-components".into());
        args.push("ejs:github".into());
    }
}

pub async fn try_auto_update_ytdlp() -> Result<String, String> {
    // 1. Try pipx upgrade yt-dlp
    if let Ok(out) = Command::new("pipx").args(["upgrade", "yt-dlp"]).output().await {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            let first_line = s.lines().next().unwrap_or("Actualizado con pipx.");
            return Ok(format!("yt-dlp actualizado mediante pipx: {}", first_line.trim()));
        }
    }

    // 2. Try uv tool upgrade yt-dlp
    let home = std::env::var("HOME").unwrap_or_default();
    let uv = PathBuf::from(&home).join(".local").join("bin").join("uv");
    if uv.exists() {
        if let Ok(out) = Command::new(&uv).args(["tool", "upgrade", "yt-dlp"]).output().await {
            if out.status.success() {
                return Ok("yt-dlp actualizado mediante uv tool.".to_string());
            }
        }
    }

    // 3. Try yt-dlp -U
    let ytdlp_bin = get_yt_dlp_binary();
    if let Ok(out) = Command::new(&ytdlp_bin).arg("-U").output().await {
        if out.status.success() {
            return Ok("yt-dlp auto-actualizado con éxito (-U).".to_string());
        }
    }

    // 4. Try pip install --upgrade --user yt-dlp
    if let Ok(out) = Command::new("python3").args(["-m", "pip", "install", "--upgrade", "--user", "yt-dlp"]).output().await {
        if out.status.success() {
            return Ok("yt-dlp actualizado mediante pip --user.".to_string());
        }
    }

    // 5. Fallback / Direct download for Windows and standalone setups
    if let Ok(msg) = download_standalone_ytdlp().await {
        return Ok(msg);
    }

    Err("No se pudo actualizar/instalar yt-dlp automáticamente.".to_string())
}

#[tauri::command]
pub async fn get_ytdlp_info() -> Result<YtDlpInfo, String> {
    let bin = get_yt_dlp_binary();
    let ver_out = Command::new(&bin).arg("--version").output().await;
    let version = match ver_out {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => "Desconocida".to_string(),
    };

    let has_node = std::path::Path::new("/usr/bin/node").exists()
        || Command::new("which").arg("node").output().await.map(|o| o.status.success()).unwrap_or(false);

    Ok(YtDlpInfo {
        version,
        path: bin.to_string_lossy().to_string(),
        node_available: has_node,
    })
}

#[tauri::command]
pub async fn update_ytdlp() -> Result<String, String> {
    try_auto_update_ytdlp().await
}


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

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let neo = dir.join(format!("neo-yt-dlp{exe_ext}"));
            if neo.exists() { return neo; }
            let standard = dir.join(format!("yt-dlp{exe_ext}"));
            if standard.exists() { return standard; }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let p = PathBuf::from(&appdata).join("musicx").join("bin").join("yt-dlp.exe");
            if p.exists() { return p; }
        }
    }

    let home = std::env::var("HOME").unwrap_or_default();
    let local_bin = PathBuf::from(&home).join(".local").join("bin").join("yt-dlp");
    if local_bin.exists() { return local_bin; }

    // Fallback: rely on system PATH
    PathBuf::from(format!("yt-dlp{exe_ext}"))
}

pub fn append_modern_ytdlp_args(args: &mut Vec<String>) {
    args.push("--no-update".into());
    args.push("--user-agent".into());
    args.push("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".into());
    args.push("--extractor-args".into());
    args.push("youtube:player_client=web,default".into());

    let has_node = std::path::Path::new("/usr/bin/node").exists()
        || std::process::Command::new("which").arg("node").output()
            .map(|o| o.status.success()).unwrap_or(false);

    if has_node {
        args.push("--js-runtimes".into());
        args.push("node".into());
        args.push("--remote-components".into());
        args.push("ejs:github".into());
    }
}

pub async fn try_auto_update_ytdlp() -> Result<String, String> {
    if let Ok(out) = Command::new("pipx").args(["upgrade", "yt-dlp"]).output().await {
        if out.status.success() {
            return Ok("yt-dlp actualizado mediante pipx.".to_string());
        }
    }
    let bin = get_yt_dlp_binary();
    if let Ok(out) = Command::new(&bin).arg("-U").output().await {
        if out.status.success() {
            return Ok("yt-dlp auto-actualizado con éxito.".to_string());
        }
    }
    Err("No se pudo actualizar yt-dlp.".to_string())
}

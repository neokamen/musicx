import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const binariesDir = join(root, "..", "src-tauri", "binaries");
const force = process.argv.includes("--force");

function rustTriple() {
  if (process.env.TAURI_ENV_TARGET_TRIPLE) return process.env.TAURI_ENV_TARGET_TRIPLE;
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";
  if (process.arch === "arm64") return "aarch64-unknown-linux-gnu";
  return "x86_64-unknown-linux-gnu";
}

function sidecarPath(name) {
  const triple = rustTriple();
  return process.platform === "win32"
    ? join(binariesDir, `${name}-${triple}.exe`)
    : join(binariesDir, `${name}-${triple}`);
}

async function download(url, dest) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Download failed ${response.status} ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const { writeFileSync } = await import("node:fs");
  writeFileSync(dest, bytes);
}

function findFile(dir, fileName) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) stack.push(full);
      else if (entry === fileName) return full;
    }
  }
  return null;
}

mkdirSync(binariesDir, { recursive: true });

const ytDest = sidecarPath("yt-dlp");
if (force || !existsSync(ytDest)) {
  const ytUrl = process.platform === "win32"
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  console.log(`Fetching yt-dlp -> ${ytDest}`);
  await download(ytUrl, ytDest);
  if (process.platform !== "win32") chmodSync(ytDest, 0o755);
}

if (process.platform === "win32") {
  const ffmpegDest = sidecarPath("ffmpeg");
  const ffprobeDest = sidecarPath("ffprobe");
  if (force || !existsSync(ffmpegDest) || !existsSync(ffprobeDest)) {
    const tmp = join(binariesDir, ".tmp-ffmpeg");
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const zip = join(tmp, "ffmpeg.zip");
    const url = process.arch === "arm64"
      ? "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-winarm64-gpl.zip"
      : "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
    console.log(`Fetching ffmpeg -> ${ffmpegDest}`);
    await download(url, zip);
    const extractDir = join(tmp, "extract");
    mkdirSync(extractDir, { recursive: true });
    const expanded = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${extractDir}' -Force`],
      { stdio: "inherit" },
    );
    if (expanded.status !== 0) {
      throw new Error("PowerShell could not extract ffmpeg");
    }
    const ffmpegSrc = findFile(extractDir, "ffmpeg.exe");
    const ffprobeSrc = findFile(extractDir, "ffprobe.exe");
    if (!ffmpegSrc || !ffprobeSrc) {
      throw new Error("ffmpeg zip did not contain ffmpeg.exe/ffprobe.exe");
    }
    copyFileSync(ffmpegSrc, ffmpegDest);
    copyFileSync(ffprobeSrc, ffprobeDest);
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log("Runtime sidecars ready.");

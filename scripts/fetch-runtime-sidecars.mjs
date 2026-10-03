import { chmodSync, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const binariesDir = join(root, "..", "src-tauri", "binaries");
const force = process.argv.includes("--force");

function rustTriple() {
  if (process.env.TAURI_ENV_TARGET_TRIPLE) return process.env.TAURI_ENV_TARGET_TRIPLE;
  if (process.platform === "win32") {
    return process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  }
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
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status} ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

mkdirSync(binariesDir, { recursive: true });

const ytDest = sidecarPath("neo-yt-dlp");
if (force || !existsSync(ytDest)) {
  const ytUrl = process.platform === "win32"
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  console.log(`Fetching yt-dlp -> ${ytDest}`);
  await download(ytUrl, ytDest);
  if (process.platform !== "win32") chmodSync(ytDest, 0o755);
}

console.log("Runtime sidecars ready.");

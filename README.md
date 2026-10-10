# musicx — the audio player

A modern, high-fidelity modular audio player for Linux and Windows. Seamlessly combines local music libraries, internet radio, and stream music in an ultra-customizable modular interface.

Powered by a high-performance **Rust** audio core (**Tauri v2**) and a reactive **Svelte 5** + **TypeScript** frontend.

- **Repository**: [https://github.com/neokamen/musicx](https://github.com/neokamen/musicx)
- **Current Version**: **0.5.5**
- **License**: MIT

---

## Key Features

### High-Fidelity Audio Engine
- **Bit-Perfect Playback**: Native PCM decoding powered by [Symphonia](https://github.com/pdeljanov/Symphonia) supporting FLAC (up to 24-bit / 192 kHz), WAV, MP3, ALAC, AAC, OGG/Vorbis, and more.
- **Direct Hardware Output**: Native CPAL integration with ALSA direct device access (`hw:X,Y`) on Linux, bypassing desktop resamplers; PipeWire/PulseAudio shared fallback, and WASAPI on Windows.
- **Dedicated Audio Thread**: True gapless playback with real-time telemetry (buffer fill percentage, latency tracking, xruns detection, and audio stream metrics).
- **Audio DSP Suite**: 10-band parametric equalizer, sub/bass boost, highpass/lowpass filtering, loudness normalization, and real-time BPM detection.

### Real-Time Visualizers & Spectral Analysis
- **Ultra-Light FFTW3 Engine**:
  - **Vector Curve**: Smooth analytical spline with optional dB grid reference lines.
  - **Frequency Monitor**: Full-height discrete spectral matrix bands with peak-hold indicators.
  - **Precision Bars & Dual Stereo Split**: High-precision discrete bins and dedicated Left/Right stereo split view.
  - **Configurable Frame Rate**: Instant FPS throttling selector (**60F**, **30F**, **15F**) to minimize CPU and GPU overhead on low-power devices.
- **In-Engine CAVA & Live Spectrum**: Powered by native `rustfft` and Canvas rendering without requiring external system dependencies.
- **Fluid Continuous Waveform**: Refined, lightweight visual representation with zero bottom fill.

### Integrated ID3 Tag & Artwork Editor (Soundix Fusion)
- Dedicated metadata editor modal accessible from the header and queue track context menu.
- Powered by native Rust [lofty](https://github.com/Serial-ATA/lofty-rs) engine.
- Edit title, artist, album, year, genre, track number, disc, and comments across all major audio formats.
- Embedded album art viewer with support for image replacement, extraction, format conversion (JPEG/PNG/WebP), and cover removal.

### Playback Queue & Analytical Studio HUD
- Virtualized playlist with sortable columns (format, bitrate, sample rate, duration), drag-and-drop reordering, and batch actions.
- Integrated quick-toggle buttons in header for **Radio**, **Stream Music**, and **MPD (Network Drive)**.
- Switching to MPD in queue presents the full remote file explorer in the main section with the remote MPD transport & volume HUD at the bottom.
- Bottom HUD monitor box featuring 12 selectable real-time analytical monitors (Session telemetry, Buffer health, FFTW3 vector curve, FFTW3 frequency monitor, CAVA, Waveform, Signal analytics, etc.).

### MPD & Network Hard Drive Integration
- **Zero-Config Auto-Discovery & Manual TCP**: Fast subnet probing and mDNS discovery on port 6600, or manual host/port/password connection.
- **Dedicated MPD Modular Widgets**: `mpd_explorer` (network disk file browser), `mpd_control` (remote transport & volume slider), and `mpd_stats` (database & server metrics) usable anywhere in the workspace layout.
- **Network Path & SMB Mapping**: Smart path resolver with prefix stripping (`USB/rootfs/...`), local mount and `smb://` GVFS resolution, and optional Samba/network credentials.
- **Remote Network Drive Explorer**: Deep directory navigation with instant parent navigation (`..`), and seamless addition to MusicX queue or remote MPD queue.
- **Smart Match & 1-Click Sync**: Real-time bidirectional comparison between local music folders and the remote MPD drive, with 1-click automatic synchronization.
- **Remote Playback Controls**: Full control over remote MPD transport (Play, Pause, Stop, Seek, Next/Previous, Volume slider & Mute, Repeat, Shuffle, and Database update).

### Library & Filesystem Explorer
- Embedded SQLite database with Write-Ahead Logging (WAL) and multithreaded incremental indexer ([`jwalk`](https://github.com/jessegrosjean/jwalk)) with live progress reporting.
- Non-blocking lazy directory browser ideal for local folders and network shares (NFS, SSHFS, SMB).

### Internet Radio & Stream Music
- **ICY Radio**: Station directory, one-click tuning, live ICY metadata stream decoding, and bandwidth metering.
- **Stream Music**: Search and stream tracks directly within the unified playback queue, with optional folder-template downloader (`yt-dlp` sidecar) and automatic metadata tagging.

### Desktop Integration & Modular UI
- **Linux MPRIS v2**: Full desktop integration (`org.mpris.MediaPlayer2.musicx`) for media keys, lock screen widgets, and desktop shell control (GNOME, KDE, etc.).
- **Window Geometry Persistence**: Automatically preserves and restores window dimensions across restarts.
- **Modular Resizable Workspace**: Freely resizable panels with presets, dark/neon/glass audiophile themes, and live JSON settings backup.

---

## Requirements

### Operating Systems
- **Linux**: Fedora, RHEL, Ubuntu, Debian, Arch Linux, etc.
- **Windows**: Windows 10 / 11 (x64, WebView2 runtime).

### Runtime Dependencies
- **RPM**: Installable via `dnf` or `rpm` on Fedora/RHEL/openSUSE.
- **AppImage**: Requires `libfuse2` and standard desktop libraries (GTK3 / WebKit2GTK).
- **Windows**: NSIS installer with bundled `yt-dlp`.

### Development & Build Prerequisites
- **Node.js** 22+ and **npm**
- **Rust** (stable toolchain, 1.75+) and **Cargo**
- **Linux Native Packages**:

**Fedora / RHEL**:
```bash
sudo dnf install -y \
  alsa-lib-devel openssl-devel dbus-devel glib2-devel \
  gtk3-devel webkit2gtk4.1-devel libappindicator-gtk3-devel \
  libxdo-devel librsvg2-devel rpm-build
```

**Ubuntu / Debian**:
```bash
sudo apt-get install -y \
  build-essential curl file libasound2-dev libayatana-appindicator3-dev \
  libfuse2 libssl-dev libwebkit2gtk-4.1-dev libxdo-dev \
  patchelf rpm librsvg2-dev
```

---

## Installation

### GitHub Releases

Pre-built binaries and packages are automatically published for every tagged release:

🔗 [https://github.com/neokamen/musicx/releases](https://github.com/neokamen/musicx/releases)

- **Fedora / RHEL (RPM)**:
  ```bash
  sudo dnf install ./musicx-*.rpm
  ```
- **Linux AppImage**:
  ```bash
  chmod +x musicx_*.AppImage
  ./musicx_*.AppImage
  ```
- **Windows**:
  Run the `musicx_*_x64-setup.exe` installer.

---

## Building From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/neokamen/musicx.git
   cd musicx
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Launch development environment:
   ```bash
   npm run tauri dev
   ```

4. Build production RPM package:
   ```bash
   npm run tauri build -- --bundles rpm
   ```

Packaged installers will be generated under `src-tauri/target/release/bundle/rpm/`.

---

## Project Structure

```text
musicx/
├── src/                         # Frontend (Svelte 5, TypeScript, Tailwind CSS)
│   ├── components/
│   │   ├── audio/               # Equalizer and audio diagnostics
│   │   ├── layout/              # Panel management and layout presets
│   │   ├── player/              # Hi-Fi bottom player and mini-player
│   │   ├── radio/               # Internet radio hub
│   │   ├── settings/            # Application settings and backup tools
│   │   ├── tagger/              # Soundix ID3 tag and album cover editor modal
│   │   └── widgets/             # Queue, library, FFTW3 visualizer, HUD monitors
│   ├── lib/                     # Audio utilities, theme engine, stream helpers
│   ├── services/                # Tauri IPC bridges and stream audio services
│   ├── store/                   # Reactive state stores and settings persistence
│   └── types/                   # TypeScript interfaces and layout definitions
├── src-tauri/                   # Backend (Rust, Tauri v2)
│   ├── src/                     # Audio core, Symphonia decoder, SQLite, MPRIS, tagger
│   ├── Cargo.toml               # Rust dependencies and package manifest
│   └── tauri.conf.json          # Tauri application configuration and bundle definitions
├── .github/workflows/           # CI/CD workflows (RPM release automation)
├── package.json                 # Node package configuration and scripts
└── LICENSE                      # MIT License
```

---

## Contributing & License

Contributions are welcome! Please feel free to open an issue or submit a pull request.

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

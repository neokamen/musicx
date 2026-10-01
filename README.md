# musicx — the audio player

Reproductor de audio Hi-Fi para Linux y Windows. Reproduce biblioteca local, radio por internet y Stream Music en la misma interfaz modular. El núcleo de audio está en Rust (Tauri v2); la interfaz es React 19 y TypeScript.

Inspirado en foobar2000 y fooyin: paneles redimensionables, widgets intercambiables y control fino del pipeline de sonido.

Repositorio: [https://github.com/neokamen/musicx-theaudioplayer](https://github.com/neokamen/musicx-theaudioplayer)

Versión actual: **0.3.17**

---

## Qué hace

- Reproduce archivos locales con decodificación nativa (Symphonia) y salida ALSA / PipeWire / CPAL.
- Modo bit-perfect hacia dispositivos `hw:X,Y` cuando el hardware lo permite, sin remuestreo del escritorio.
- Reproducción gapless con hilo de audio dedicado y telemetría de buffer, latencia y formato real.
- Biblioteca SQLite (WAL) con escaneo incremental multihilo (`jwalk`) y progreso en vivo.
- Explorador de carpetas lazy, usable en NFS, SSHFS y SMB.
- Radio ICY con relé local, metadatos y medición de tráfico.
- Stream Music: búsqueda y reproducción mezclada con la cola local, descarga con plantilla de carpetas y editor de metadatos.
- Cola de reproducción con columnas (formato, bitrate, duración), arrastrar archivos, telemetría ciclable y descarga.
- Ecualizador, normalizador, BPM y estadísticas de escucha.
- Visualizadores CAVA y espectro: FFT interno (`rustfft` + canvas). No instala ni requiere el programa `cava` de Linux.
- Mini reproductor, temas, acentos, copias de seguridad de configuración y de estadísticas.
- MPRIS v2 en Linux para teclas multimedia y el entorno de escritorio (GNOME, KDE, etc.). En Windows la salida de audio es WASAPI a través de CPAL.

---

## Requisitos

Sistema: Linux (Fedora / Ubuntu) y Windows 10/11 (x64, WebView2).

Para ejecutar un release:

- AppImage: FUSE (`libfuse2` o equivalente) y bibliotecas de escritorio habituales (GTK / WebKit).
- RPM: Fedora / RHEL o un sistema que instale RPM.
- Windows: instalador NSIS; Microsoft Edge WebView2 Runtime (el instalador puede desplegarlo). yt-dlp y ffmpeg no van empaquetados: se instalan desde Ajustes → General.

Para desarrollar o compilar:

- Node.js 22 y npm
- Rust estable (1.75 o posterior) y Cargo
- Dependencias nativas (nombres Fedora):

```bash
sudo dnf install -y \
  alsa-lib-devel openssl-devel dbus-devel glib2-devel \
  gtk3-devel webkit2gtk4.1-devel libappindicator-gtk3-devel \
  libxdo-devel librsvg2-devel
```

En Debian / Ubuntu 22.04:

```bash
sudo apt-get install -y \
  build-essential curl file libasound2-dev libayatana-appindicator3-dev \
  libfuse2 libssl-dev libwebkit2gtk-4.1-dev libxdo-dev \
  patchelf rpm librsvg2-dev
```

---

## Instalación

### Desde GitHub Releases

Cada etiqueta `v*` dispara el workflow **Release**, que publica AppImage, RPM e instalador NSIS de Windows:

[https://github.com/neokamen/musicx-theaudioplayer/releases](https://github.com/neokamen/musicx-theaudioplayer/releases)

1. Linux: descarga el `.AppImage` o el `.rpm`.
2. AppImage: `chmod +x musicx_*.AppImage` y ejecútalo.
3. RPM: `sudo dnf install ./musicx-*.rpm` (o `rpm -Uvh`).
4. Windows: ejecuta el instalador `.exe` (NSIS).

### Desde el código

```bash
git clone https://github.com/neokamen/musicx-theaudioplayer.git
cd musicx-theaudioplayer
npm install
npm run tauri dev
```

Compilar paquetes locales:

```bash
npm run tauri build
```

o, como en CI:

```bash
npm run tauri build -- --bundles appimage rpm --ci
```

Los artefactos quedan en `src-tauri/target/release/bundle/`.

---

## Uso rápido

1. En Ajustes, indica la carpeta de música y lanza un escaneo.
2. Reproduce desde la lista virtualizada, el explorador o soltando archivos sobre la ventana o la cola.
3. Activa **Editar interfaz** para dividir paneles, cambiar widgets y guardar el layout.
4. Abre radio o Stream Music desde la cola o como widget embebido.
5. El tamaño de ventana se restaura al arrancar. Un backup completo puede vincularse a un archivo JSON y se reescribe al cambiar ajustes.

La cola, debajo de la lista, muestra un HUD (sesión, buffer, cola, señal). Doble clic para cambiar de panel.

---

## Motor de audio

- Decodificación PCM con Symphonia: FLAC (hasta 24 bit / 192 kHz), WAV, MP3, ALAC, AAC, OGG/Vorbis y otros formatos habilitados en el crate.
- Salida CPAL; en Linux, ALSA exclusivo o dispositivo compartido (PipeWire).
- Buffer configurable (64–1024 frames) con inspector de llenado, xruns, latencia y, en stream/radio, estimación de caudal.
- DSP opcional: EQ, sub/bass boost, highpass/lowpass, normalizador, modos extra de realce.
- FFT (`rustfft`) para espectro y visualizador tipo CAVA.

Stream y radio no pasan por el mismo decoder de archivos: usan un relé HTTP local (`ureq`) más un elemento `HTMLAudio` con DSP Web Audio cuando aplica. Pausar marca pausa de usuario para que el stream no se reanude solo.

---

## Biblioteca y archivos

- SQLite embebido (`rusqlite`, WAL, `synchronous=NORMAL`).
- Escaneo por `mtime` para no releer pistas sin cambios.
- Eventos Tauri de progreso de índice.
- Explorador lazy (`std::fs::read_dir`) sin leer tags hasta que hace falta.
- Ruta editable y migas de pan clicables.

---

## Interfaz

Paneles con `react-resizable-panels`, serializados a JSON en `localStorage`. Presets de layout (tres columnas, estudio CAVA, biblioteca ancha, etc.) y favoritos.

Widgets disponibles (entre otros):

- Explorador de carpetas
- Lista de pistas virtualizada (`@tanstack/react-virtual`)
- Carátula, inspector, etiquetas ID3
- Cola de reproducción
- Radio y Stream Music
- Visualizador CAVA y espectro independiente
- Telemetría DAC (completa y compacta)
- Inspector de buffer (completo, compacto, estabilidad)
- EQ, loudness, BPM, estadísticas de escucha y de señal
- Diagnóstico de audio

Barra inferior Hi-Fi: transporte (varias plantillas), estilos de seek (clásico, espectro, híbrido, aurora, segmentos, cinta), volumen con boost opcional, pulso BPM y efecto al pulsar Play. Mini reproductor con plantillas y tamaño propio.

Temas: color de acento, fondo, cristal, neón, bordes tintados, curvatura, resplandor ambiental.

---

## Radio, Stream Music y descargas

- Radio: directorio de emisoras, sintonía, metadatos ICY, grabación opcional de cortes.
- Stream Music: cliente integrado; las pistas entran en la misma cola que los archivos locales.
- Descarga: diálogo con bitrate o FLAC/WAV, estructura de carpetas por tokens (`{artist}`, `{year}`, `{album}`, `{trackNumber}`, `{title}`), búsqueda de carátula y escritura en disco.

---

## Ajustes, copias y estadísticas

- Idioma de la interfaz.
- Ajustes de biblioteca: carpeta de música, carpeta del explorador, reproducir al soltar archivos.
- Backup vivo de configuración (`musicx-full-backup-v1`) ligado a una ruta; la ruta se reinyecta al guardar para no perder el vínculo.
- Sincronización de estadísticas de escucha a un archivo JSON (intervalos o al cerrar).
- Sesiones: una por arranque. Canciones reproducidas: una por pista iniciada. Tiempo escuchado acumulado durante la reproducción.

---

## Linux / escritorio

Servicio MPRIS `org.mpris.MediaPlayer2.musicx`: play/pausa, siguiente/anterior, metadatos y carátula para el shell y los auriculares.

---

## Estructura del repositorio

```text
musicx-theaudioplayer/
├── src/                         Frontend (React 19, TypeScript, Tailwind)
│   ├── components/
│   │   ├── layout/              LayoutManager, presets y edición de paneles
│   │   ├── player/              Barra Hi-Fi y mini reproductor
│   │   ├── settings/            Ajustes
│   │   ├── audio/               Ecualizador
│   │   ├── radio/               Hub de radio
│   │   └── widgets/             Explorador, lista, cola, Stream, CAVA, buffer, etc.
│   ├── services/                IPC Tauri y radioAudioService
│   ├── store/                   Zustand (reproducción, ajustes, backups)
│   ├── lib/                     Tema, formatos, pistas de stream
│   └── types/
├── src-tauri/                   Backend Rust
│   ├── src/                     Audio, SQLite, FS lazy, MPRIS, relé radio, comandos
│   ├── tauri.conf.json
│   └── Cargo.toml
├── .github/workflows/release.yml  AppImage, RPM y NSIS Windows al publicar un tag v*
├── package.json
└── LICENSE
```

Estado global: Zustand. IPC: `@tauri-apps/api` v2. Diálogos nativos: `@tauri-apps/plugin-dialog`.

---

## Desarrollo

| Comando | Efecto |
| --- | --- |
| `npm run tauri dev` | Ventana nativa + Vite en `http://localhost:1420` |
| `npm run dev` | Solo frontend (sin backend Tauri) |
| `npm run build` | `tsc` + Vite (el empaquetado Tauri lo llama antes de rustc) |
| `npm run tauri build` | Binario y bundles de instalación |

El workflow de Release usa Node 22 y Rust stable. En Ubuntu genera AppImage y RPM; en `windows-latest` genera el instalador NSIS. `tsc` tiene `strict` y `noUnusedLocals`; un error de tipos corta el paquete. MPRIS/GTK solo se enlazan en Linux. CAVA no es una dependencia nativa.

---

## Licencia

MIT. Ver `LICENSE`.

// Local relay for internet radio streams.
//
// The frontend plays radio through a plain <audio> element pointed straight at the
// station's URL, which means the browser never exposes real transferred bytes nor the
// ICY ("Icy-MetaData") metadata that carries the currently playing song title.
//
// This module opens the upstream connection itself (requesting ICY metadata), strips the
// interleaved metadata blocks before forwarding clean audio bytes to a local loopback
// HTTP server that the <audio> element connects to instead. While relaying it counts the
// real bytes read from the network and emits Tauri events whenever the song title changes,
// so the frontend can show accurate data-usage figures and auto-record songs.
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

struct RelayHandle {
    stop_flag: Arc<AtomicBool>,
    port: u16,
}

#[derive(Default)]
pub struct RadioRelayState {
    current: Mutex<Option<RelayHandle>>,
}

#[derive(Clone, serde::Serialize)]
struct TrackChangedPayload {
    title: String,
}

#[derive(Clone, serde::Serialize)]
struct BytesPayload {
    bytes_total: u64,
}

pub fn start(
    url: String,
    app_handle: AppHandle,
    state: &RadioRelayState,
) -> Result<String, String> {
    stop(state);

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_thread = Arc::clone(&stop_flag);

    std::thread::Builder::new()
        .name("musicx-radio-relay".to_string())
        .spawn(move || run_relay(url, listener, stop_flag_thread, app_handle))
        .map_err(|e| e.to_string())?;

    *state.current.lock().unwrap() = Some(RelayHandle { stop_flag, port });

    Ok(format!("http://127.0.0.1:{port}/stream"))
}

pub fn stop(state: &RadioRelayState) {
    if let Some(handle) = state.current.lock().unwrap().take() {
        handle.stop_flag.store(true, Ordering::SeqCst);
        // Unblock the listener's accept() call so the relay thread can exit
        let _ = TcpStream::connect(("127.0.0.1", handle.port));
    }
}

fn open_upstream(agent: &ureq::Agent, url: &str) -> Result<ureq::Response, ureq::Error> {
    let mut request = agent
        .get(url)
        .set("Icy-MetaData", "1")
        .set(
            "User-Agent",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .set("Accept", "*/*");
    if url.contains("googlevideo.com") || url.contains("youtube.com") {
        request = request.set("Referer", "https://www.youtube.com/");
    }
    request.call()
}

fn run_relay(
    url: String,
    listener: TcpListener,
    stop_flag: Arc<AtomicBool>,
    app_handle: AppHandle,
) {
    let (client_stream, _) = match listener.accept() {
        Ok(pair) => pair,
        Err(_) => return,
    };
    if stop_flag.load(Ordering::SeqCst) {
        return;
    }

    // Consume the browser's request line/headers; we don't need to inspect them
    {
        let mut reader = BufReader::new(match client_stream.try_clone() {
            Ok(s) => s,
            Err(_) => return,
        });
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if line == "\r\n" || line == "\n" {
                        break;
                    }
                }
            }
        }
    }

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(8))
        .build();

    let mut client_writer = client_stream;
    let mut bytes_total: u64 = 0;
    let mut last_title = String::new();
    let mut last_emit = Instant::now();
    let mut buf = vec![0u8; 8192];
    let mut retry_delay_seconds = 1u64;

    // Keep the local HTTP response open across upstream outages so the audio element
    // can continue consuming the same stream after the station becomes reachable again.
    let mut response = loop {
        if stop_flag.load(Ordering::SeqCst) {
            return;
        }
        match open_upstream(&agent, &url)
        {
            Ok(response) => break response,
            Err(_) => {
                if wait_before_retry(&stop_flag, retry_delay_seconds) {
                    return;
                }
                retry_delay_seconds = (retry_delay_seconds * 2).min(30);
            }
        }
    };

    let content_type = response
        .header("content-type")
        .unwrap_or("audio/mpeg")
        .to_string();
    let header = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n"
    );
    if client_writer.write_all(header.as_bytes()).is_err() {
        return;
    }

    loop {
        if stop_flag.load(Ordering::SeqCst) {
            break;
        }

        let metaint: usize = response
            .header("icy-metaint")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        let mut upstream = response.into_reader();
        let mut disconnected = false;

        while !stop_flag.load(Ordering::SeqCst) && !disconnected {
            let to_read = if metaint > 0 { metaint } else { buf.len() };
            let mut remaining = to_read;
            while remaining > 0 {
                let chunk = remaining.min(buf.len());
                let read = match upstream.read(&mut buf[..chunk]) {
                    Ok(0) | Err(_) => {
                        disconnected = true;
                        break;
                    }
                    Ok(n) => n,
                };
                if client_writer.write_all(&buf[..read]).is_err() {
                    return;
                }
                bytes_total += read as u64;
                remaining -= read;
            }
            if disconnected {
                continue;
            }

            if metaint > 0 {
                let mut len_byte = [0u8; 1];
                if upstream.read_exact(&mut len_byte).is_err() {
                    disconnected = true;
                    continue;
                }
                let meta_len = (len_byte[0] as usize) * 16;
                if meta_len > 0 {
                    let mut meta_buf = vec![0u8; meta_len];
                    if upstream.read_exact(&mut meta_buf).is_err() {
                        disconnected = true;
                        continue;
                    }
                    if let Some(title) = parse_stream_title(&meta_buf) {
                        if !title.is_empty() && title != last_title {
                            last_title = title.clone();
                            let _ =
                                app_handle.emit("radio-relay-track", TrackChangedPayload { title });
                        }
                    }
                }
            }

            if last_emit.elapsed() >= Duration::from_millis(1000) {
                let _ = app_handle.emit("radio-relay-bytes", BytesPayload { bytes_total });
                last_emit = Instant::now();
            }
        }

        if stop_flag.load(Ordering::SeqCst) {
            break;
        }
        if wait_before_retry(&stop_flag, retry_delay_seconds) {
            break;
        }
        retry_delay_seconds = (retry_delay_seconds * 2).min(30);
        let mut reconnected_response = None;
        loop {
            if stop_flag.load(Ordering::SeqCst) {
                break;
            }
            match open_upstream(&agent, &url)
            {
                Ok(response) => {
                    retry_delay_seconds = 1;
                    reconnected_response = Some(response);
                    break;
                }
                Err(_) => {
                    if wait_before_retry(&stop_flag, retry_delay_seconds) {
                        break;
                    }
                    retry_delay_seconds = (retry_delay_seconds * 2).min(30);
                }
            }
        }
        let Some(next_response) = reconnected_response else {
            break;
        };
        response = next_response;
    }

    let _ = app_handle.emit("radio-relay-bytes", BytesPayload { bytes_total });
}

fn wait_before_retry(stop_flag: &AtomicBool, seconds: u64) -> bool {
    let deadline = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < deadline {
        if stop_flag.load(Ordering::SeqCst) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    stop_flag.load(Ordering::SeqCst)
}

fn parse_stream_title(meta: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(meta);
    let start = text.find("StreamTitle='")? + "StreamTitle='".len();
    let rest = &text[start..];
    let end = rest.find("';")?;
    Some(rest[..end].trim().to_string())
}

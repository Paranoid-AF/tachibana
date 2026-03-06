use std::io::Write;
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::types::{IpcOutgoing, IpcRequest};

/// Read one JSON line from stdin. Returns None on EOF.
pub async fn read_request(
    reader: &mut BufReader<tokio::io::Stdin>,
) -> Option<Result<IpcRequest, String>> {
    let mut line = String::new();
    match reader.read_line(&mut line).await {
        Ok(0) => None, // EOF
        Ok(_) => {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return Some(Err("empty line".to_string()));
            }
            match serde_json::from_str::<IpcRequest>(trimmed) {
                Ok(req) => Some(Ok(req)),
                Err(e) => Some(Err(format!("JSON parse error: {e}"))),
            }
        }
        Err(e) => Some(Err(format!("stdin read error: {e}"))),
    }
}

/// Write a JSON line to stdout (synchronous to avoid interleaving).
pub fn write_message(msg: &IpcOutgoing) {
    let json = serde_json::to_string(msg).expect("serialize IPC message");
    let stdout = std::io::stdout();
    let mut lock = stdout.lock();
    let _ = writeln!(lock, "{json}");
    let _ = lock.flush();
}

/// Convenience: send a success response.
pub fn send_success(id: &str, result: serde_json::Value) {
    write_message(&IpcOutgoing::success(id, result));
}

/// Convenience: send an error response.
pub fn send_error(id: &str, code: &str, message: &str) {
    write_message(&IpcOutgoing::error(id, code, message));
}

/// Convenience: send an unsolicited event.
pub fn send_event(event: &str, data: serde_json::Value) {
    write_message(&IpcOutgoing::event(event, data));
}

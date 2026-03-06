mod commands;
mod handler;
mod ipc;
mod session;
mod types;

use std::path::PathBuf;
use std::sync::Arc;

use clap::Parser;
use tokio::io::BufReader;
use tokio::sync::Mutex;

use session::SessionState;

#[derive(Parser, Debug)]
#[command(name = "kani-isideload", about = "IPC daemon for iOS sideloading")]
struct Args {
    /// Data directory for persistent storage (certs, keys, anisette state).
    #[arg(long, default_value = ".")]
    data_dir: PathBuf,

    /// Override anisette WebSocket server URL.
    #[arg(long)]
    anisette_url: Option<String>,
}

#[tokio::main]
async fn main() {
    // Initialize isideload error reporting
    let _ = isideload::init();

    // Parse CLI arguments
    let args = Args::parse();

    // Set up tracing to stderr (stdout is reserved for IPC)
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_target(false)
        .json()
        .init();

    tracing::info!(data_dir = %args.data_dir.display(), "kani-isideload daemon starting");

    let state = Arc::new(Mutex::new(SessionState::new(args.data_dir, args.anisette_url)));
    let mut reader = BufReader::new(tokio::io::stdin());

    // Main IPC loop: read JSON Lines from stdin, spawn each handler as a task
    // so that concurrent requests (e.g. login + submit2fa) don't deadlock.
    loop {
        match ipc::read_request(&mut reader).await {
            Some(Ok(request)) => {
                tracing::debug!(method = %request.method, id = %request.id, "handling request");
                let state = state.clone();
                tokio::spawn(async move {
                    handler::dispatch(state, request).await;
                });
            }
            Some(Err(e)) => {
                tracing::warn!(error = %e, "failed to parse request");
            }
            None => {
                tracing::info!("stdin closed, shutting down");
                break;
            }
        }
    }
}

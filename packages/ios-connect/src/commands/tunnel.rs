use std::collections::HashMap;
use std::sync::OnceLock;

use idevice::usbmuxd::UsbmuxdConnection;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio::task::AbortHandle;

static TUNNELS: OnceLock<Mutex<HashMap<u16, AbortHandle>>> = OnceLock::new();

fn tunnels() -> &'static Mutex<HashMap<u16, AbortHandle>> {
    TUNNELS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Bind a local TCP port and forward all connections to `remote_port` on the device.
/// Returns the local port number. The tunnel runs until `stop_tunnel` is called.
pub async fn start_tunnel(udid: &str, remote_port: u16) -> napi::Result<u16> {
    // Verify the device is reachable and resolve device_id upfront.
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Device not found: {e}")))?;

    let device_id = device.device_id;

    // Bind on a random loopback port (OS assigns).
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to bind local port: {e}")))?;

    let local_port = listener
        .local_addr()
        .map_err(|e| napi::Error::from_reason(format!("Failed to get local address: {e}")))?
        .port();

    let abort_handle = tokio::spawn(async move {
        loop {
            let Ok((mut local_stream, _)) = listener.accept().await else {
                break;
            };

            tokio::spawn(async move {
                let Ok(uconn) = UsbmuxdConnection::default().await else {
                    return;
                };

                let Ok(device_conn) = uconn
                    .connect_to_device(device_id, remote_port, "kani-isideload")
                    .await
                else {
                    return;
                };

                let Some(mut socket) = device_conn.get_socket() else {
                    return;
                };

                let _ =
                    tokio::io::copy_bidirectional(&mut local_stream, &mut socket).await;
            });
        }
    })
    .abort_handle();

    tunnels().lock().await.insert(local_port, abort_handle);

    Ok(local_port)
}

/// Stop a tunnel started by `start_tunnel`, identified by its local port.
pub async fn stop_tunnel(local_port: u16) -> napi::Result<()> {
    if let Some(handle) = tunnels().lock().await.remove(&local_port) {
        handle.abort();
    }
    Ok(())
}

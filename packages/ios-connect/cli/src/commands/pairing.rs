use serde_json::json;
use uuid::Uuid;

use idevice::services::lockdown::LockdownClient;
use idevice::usbmuxd::UsbmuxdConnection;

use crate::ipc;
use crate::types::{PairDeviceParams, ValidatePairingParams};

/// Pair the device with this host, triggering the "Trust This Computer?" dialog on the device.
/// Blocks until the user accepts or rejects the pairing request.
pub async fn pair_device(id: &str, params: PairDeviceParams) {
    let mut conn = match UsbmuxdConnection::default().await {
        Ok(c) => c,
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Failed to connect to usbmuxd: {e}"));
            return;
        }
    };

    let device = match conn.get_device(&params.udid).await {
        Ok(d) => d,
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Device not found: {e}"));
            return;
        }
    };

    let system_buid = match conn.get_buid().await {
        Ok(b) => b,
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Failed to get system BUID: {e}"));
            return;
        }
    };

    let host_id = Uuid::new_v4().to_string().to_uppercase();

    // connect_to_device consumes conn, so this must be last use of conn
    let idevice_conn = match conn
        .connect_to_device(device.device_id, LockdownClient::LOCKDOWND_PORT, "kani-isideload")
        .await
    {
        Ok(i) => i,
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Failed to connect to lockdown: {e}"));
            return;
        }
    };

    let mut lockdown = LockdownClient::new(idevice_conn);

    let pair_file = match lockdown.pair(host_id, system_buid, None).await {
        Ok(p) => p,
        Err(e) => {
            ipc::send_error(id, "PAIRING_ERROR", &format!("Pairing failed: {e}"));
            return;
        }
    };

    let pair_bytes = match pair_file.serialize() {
        Ok(b) => b,
        Err(e) => {
            ipc::send_error(id, "PAIRING_ERROR", &format!("Failed to serialize pairing record: {e}"));
            return;
        }
    };

    let mut save_conn = match UsbmuxdConnection::default().await {
        Ok(c) => c,
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Failed to reconnect to usbmuxd: {e}"));
            return;
        }
    };

    match save_conn.save_pair_record(&params.udid, pair_bytes).await {
        Ok(_) => ipc::send_success(id, json!({ "paired": true })),
        Err(e) => ipc::send_error(id, "PAIRING_ERROR", &format!("Failed to save pairing record: {e}")),
    }
}

/// Check whether the device has a pairing record stored in usbmuxd.
pub async fn validate_pairing(id: &str, params: ValidatePairingParams) {
    let mut conn = match UsbmuxdConnection::default().await {
        Ok(c) => c,
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Failed to connect to usbmuxd: {e}"));
            return;
        }
    };

    let paired = conn.get_pair_record(&params.udid).await.is_ok();
    ipc::send_success(id, json!({ "paired": paired }));
}

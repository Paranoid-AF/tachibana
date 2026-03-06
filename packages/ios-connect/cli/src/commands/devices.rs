use serde_json::json;

use idevice::usbmuxd::UsbmuxdConnection;
use isideload::dev::devices::DevicesApi;
use isideload::dev::teams::TeamsApi;

use crate::ipc;
use crate::session::{self, SessionState};
use crate::types::{RegisterDeviceParams, TeamIdParams};

/// List devices registered on the Apple Developer Portal.
pub async fn list(state: &mut SessionState, id: &str, params: TeamIdParams) {
    let session = match state.dev_session.as_mut() {
        Some(s) => s,
        None => {
            ipc::send_error(id, "AUTH_REQUIRED", "Not logged in. Call 'login' first.");
            return;
        }
    };

    let teams = match session.list_teams().await {
        Ok(t) => t,
        Err(e) => {
            ipc::send_error(id, "TEAM_ERROR", &format!("Failed to list teams: {e}"));
            return;
        }
    };

    let team = match session::select_team(teams, params.team_id.as_deref()) {
        Some(t) => t,
        None => {
            ipc::send_error(id, "TEAM_ERROR", "No matching developer team found");
            return;
        }
    };

    match session.list_devices(&team, None::<isideload::dev::device_type::DeveloperDeviceType>).await {
        Ok(devices) => {
            let devices_json: Vec<_> = devices
                .iter()
                .map(|d| {
                    json!({
                        "udid": d.device_number,
                        "name": d.name,
                        "status": d.status,
                    })
                })
                .collect();
            ipc::send_success(id, json!({ "devices": devices_json }));
        }
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Failed to list devices: {e}"));
        }
    }
}

/// Register a device on the Apple Developer Portal.
pub async fn register(state: &mut SessionState, id: &str, params: RegisterDeviceParams) {
    let session = match state.dev_session.as_mut() {
        Some(s) => s,
        None => {
            ipc::send_error(id, "AUTH_REQUIRED", "Not logged in. Call 'login' first.");
            return;
        }
    };

    let teams = match session.list_teams().await {
        Ok(t) => t,
        Err(e) => {
            ipc::send_error(id, "TEAM_ERROR", &format!("Failed to list teams: {e}"));
            return;
        }
    };

    let team = match session::select_team(teams, params.team_id.as_deref()) {
        Some(t) => t,
        None => {
            ipc::send_error(id, "TEAM_ERROR", "No matching developer team found");
            return;
        }
    };

    match session.add_device(&team, &params.name, &params.udid, None::<isideload::dev::device_type::DeveloperDeviceType>).await {
        Ok(_) => {
            ipc::send_success(id, json!({ "success": true }));
        }
        Err(e) => {
            ipc::send_error(
                id,
                "DEVICE_ERROR",
                &format!("Failed to register device: {e}"),
            );
        }
    }
}

/// List physically connected USB devices via idevice/usbmuxd.
pub async fn list_connected(id: &str) {
    let mut conn = match UsbmuxdConnection::default().await {
        Ok(c) => c,
        Err(e) => {
            ipc::send_error(
                id,
                "DEVICE_ERROR",
                &format!("Failed to connect to usbmuxd: {e}"),
            );
            return;
        }
    };

    match conn.get_devices().await {
        Ok(devices) => {
            let devices_json: Vec<_> = devices
                .iter()
                .map(|d| {
                    json!({
                        "udid": d.udid,
                        "name": d.udid,
                        "productType": "",
                        "productVersion": "",
                    })
                })
                .collect();
            ipc::send_success(id, json!({ "devices": devices_json }));
        }
        Err(e) => {
            ipc::send_error(
                id,
                "DEVICE_ERROR",
                &format!("Failed to list connected devices: {e}"),
            );
        }
    }
}

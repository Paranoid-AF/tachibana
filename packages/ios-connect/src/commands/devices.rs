use idevice::services::lockdown::LockdownClient;
use idevice::usbmuxd::UsbmuxdConnection;
use isideload::dev::devices::DevicesApi;
use isideload::dev::teams::TeamsApi;

use crate::session::{self, SessionState};
use crate::types::{ConnectedDevice, Device};

/// List devices registered on the Apple Developer Portal.
pub async fn list(
    state: &mut SessionState,
    team_id: Option<&str>,
) -> napi::Result<Vec<Device>> {
    let session = state
        .dev_session
        .as_mut()
        .ok_or_else(|| napi::Error::from_reason("Not logged in. Call 'login' first."))?;

    let teams = session
        .list_teams()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list teams: {e}")))?;

    let team = session::select_team(teams, team_id)
        .ok_or_else(|| napi::Error::from_reason("No matching developer team found"))?;

    let devices = session
        .list_devices(
            &team,
            None::<isideload::dev::device_type::DeveloperDeviceType>,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list devices: {e}")))?;

    Ok(devices
        .iter()
        .map(|d| Device {
            udid: d.device_number.clone(),
            name: d.name.clone().unwrap_or_default(),
            status: d.status.clone().unwrap_or_default(),
        })
        .collect())
}

/// Register a device on the Apple Developer Portal.
pub async fn register(
    state: &mut SessionState,
    udid: &str,
    name: &str,
    team_id: Option<&str>,
) -> napi::Result<()> {
    let session = state
        .dev_session
        .as_mut()
        .ok_or_else(|| napi::Error::from_reason("Not logged in. Call 'login' first."))?;

    let teams = session
        .list_teams()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list teams: {e}")))?;

    let team = session::select_team(teams, team_id)
        .ok_or_else(|| napi::Error::from_reason("No matching developer team found"))?;

    session
        .add_device(
            &team,
            name,
            udid,
            None::<isideload::dev::device_type::DeveloperDeviceType>,
        )
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to register device: {e}")))?;

    Ok(())
}

/// List physically connected USB devices via idevice/usbmuxd.
pub async fn list_connected() -> napi::Result<Vec<ConnectedDevice>> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    let devices = conn
        .get_devices()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to list connected devices: {e}")))?;

    let mut result = Vec::new();
    for d in &devices {
        let (name, product_type, product_version) =
            query_device_info(&d.udid, d.device_id).await.unwrap_or_else(|_| {
                (d.udid.clone(), String::new(), String::new())
            });
        result.push(ConnectedDevice {
            udid: d.udid.clone(),
            name,
            product_type,
            product_version,
        });
    }
    Ok(result)
}

async fn query_device_info(
    udid: &str,
    device_id: u32,
) -> napi::Result<(String, String, String)> {
    let conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    let idevice_conn = conn
        .connect_to_device(device_id, LockdownClient::LOCKDOWND_PORT, "tbana-isideload")
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to lockdown: {e}")))?;

    let mut lockdown = LockdownClient::new(idevice_conn);

    let name = lockdown
        .get_value(Some("DeviceName"), None)
        .await
        .ok()
        .and_then(|v| v.as_string().map(str::to_string))
        .unwrap_or_else(|| udid.to_string());

    let product_type = lockdown
        .get_value(Some("ProductType"), None)
        .await
        .ok()
        .and_then(|v| v.as_string().map(str::to_string))
        .unwrap_or_default();

    let product_version = lockdown
        .get_value(Some("ProductVersion"), None)
        .await
        .ok()
        .and_then(|v| v.as_string().map(str::to_string))
        .unwrap_or_default();

    Ok((name, product_type, product_version))
}

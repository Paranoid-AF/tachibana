use std::collections::HashMap;

use idevice::services::installation_proxy::InstallationProxyClient;
use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};
use idevice::IdeviceService;

/// List installed apps on the device via the installation_proxy service.
/// Returns a map of bundle ID → app info (plist dict serialized as JSON).
pub async fn list_installed_apps(
    udid: &str,
    app_type: Option<&str>,
) -> napi::Result<Vec<InstalledAppInfo>> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("usbmuxd: {e}")))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Device not found: {e}")))?;

    let provider = device.to_provider(UsbmuxdAddr::default(), "tbana-instproxy");

    let mut client = InstallationProxyClient::connect(&provider)
        .await
        .map_err(|e| napi::Error::from_reason(format!("InstallationProxy connect: {e}")))?;

    let apps: HashMap<String, plist::Value> = client
        .get_apps(app_type, None)
        .await
        .map_err(|e| napi::Error::from_reason(format!("get_apps: {e}")))?;

    let mut result = Vec::new();
    for (bundle_id, info) in apps {
        let mut bundle_name = None;
        let mut bundle_executable = None;

        if let Some(dict) = info.as_dictionary() {
            bundle_name = dict
                .get("CFBundleName")
                .and_then(|v| v.as_string())
                .map(|s| s.to_string());
            bundle_executable = dict
                .get("CFBundleExecutable")
                .and_then(|v| v.as_string())
                .map(|s| s.to_string());
        }

        result.push(InstalledAppInfo {
            bundle_id,
            bundle_name,
            bundle_executable,
        });
    }

    Ok(result)
}

#[napi_derive::napi(object)]
#[derive(Clone)]
pub struct InstalledAppInfo {
    pub bundle_id: String,
    pub bundle_name: Option<String>,
    pub bundle_executable: Option<String>,
}

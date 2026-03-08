use std::path::Path;

use idevice::IdeviceService;
use idevice::services::screenshotr::ScreenshotService;
use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};

pub async fn screenshot(udid: &str, output_path: &str) -> napi::Result<String> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Device not found: {e}")))?;

    let provider = device.to_provider(UsbmuxdAddr::default(), "tbana-isideload");

    let mut client = ScreenshotService::connect(&provider)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to start screenshotr service: {e}")))?;

    let data = client
        .take_screenshot()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to take screenshot: {e}")))?;

    let out = Path::new(output_path);
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(out, &data)
        .map_err(|e| napi::Error::from_reason(format!("Failed to write screenshot: {e}")))?;

    Ok(output_path.to_string())
}

use serde_json::json;
use std::path::Path;

use idevice::IdeviceService;
use idevice::services::screenshotr::ScreenshotService;
use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};

use crate::ipc;
use crate::types::ScreenshotParams;

pub async fn screenshot(id: &str, params: ScreenshotParams) {
    // Connect to usbmuxd and find the device
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

    let device = match conn.get_device(&params.udid).await {
        Ok(d) => d,
        Err(e) => {
            ipc::send_error(
                id,
                "DEVICE_ERROR",
                &format!("Device not found: {e}"),
            );
            return;
        }
    };

    let provider = device.to_provider(UsbmuxdAddr::default(), "kani-isideload");

    match ScreenshotService::connect(&provider).await {
        Ok(mut client) => match client.take_screenshot().await {
            Ok(data) => {
                let output_path = Path::new(&params.output_path);
                if let Some(parent) = output_path.parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                match std::fs::write(output_path, &data) {
                    Ok(_) => {
                        ipc::send_success(id, json!({ "path": params.output_path }));
                    }
                    Err(e) => {
                        ipc::send_error(
                            id,
                            "IO_ERROR",
                            &format!("Failed to write screenshot: {e}"),
                        );
                    }
                }
            }
            Err(e) => {
                ipc::send_error(
                    id,
                    "DEVICE_ERROR",
                    &format!("Failed to take screenshot: {e}"),
                );
            }
        },
        Err(e) => {
            ipc::send_error(
                id,
                "DEVICE_ERROR",
                &format!("Failed to start screenshotr service: {e}"),
            );
        }
    }
}

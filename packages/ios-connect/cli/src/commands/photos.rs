use serde_json::json;
use std::path::Path;
use tokio::io::AsyncReadExt;

use idevice::IdeviceService;
use idevice::afc::{AfcClient, opcode::AfcFopenMode};
use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};

use crate::ipc;
use crate::types::{DownloadPhotoParams, ListPhotosParams};

const PHOTO_EXTENSIONS: &[&str] = &[
    "heic", "heif", "jpg", "jpeg", "png", "gif", "tiff", "tif", "bmp", "mov", "mp4", "m4v",
    "aae",
];

fn is_photo_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    PHOTO_EXTENSIONS
        .iter()
        .any(|ext| lower.ends_with(&format!(".{ext}")))
}

/// Walk DCIM using the fixed two-level structure iOS enforces:
///   DCIM/<album_dir>/<file>
/// No recursion needed — files never live deeper than this.
async fn collect_photos(client: &mut AfcClient, out: &mut Vec<serde_json::Value>) {
    let album_dirs = match client.list_dir("/DCIM").await {
        Ok(e) => e,
        Err(_) => return,
    };

    for album in album_dirs {
        if album == "." || album == ".." {
            continue;
        }

        let album_path = format!("/DCIM/{album}");

        let files = match client.list_dir(&album_path).await {
            Ok(f) => f,
            Err(_) => continue,
        };

        for file in files {
            if file == "." || file == ".." || !is_photo_file(&file) {
                continue;
            }

            let full_path = format!("{album_path}/{file}");

            let info = match client.get_file_info(&full_path).await {
                Ok(i) => i,
                Err(_) => continue,
            };

            let modified_ts = info.modified.and_utc().timestamp();
            out.push(json!({
                "path": full_path,
                "size": info.size,
                "modified": modified_ts,
            }));
        }
    }
}

pub async fn list_photos(id: &str, params: ListPhotosParams) {
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

    let provider = device.to_provider(UsbmuxdAddr::default(), "kani-isideload");

    let mut client = match AfcClient::connect(&provider).await {
        Ok(c) => c,
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Failed to connect AFC service: {e}"));
            return;
        }
    };

    let mut photos = Vec::new();
    collect_photos(&mut client, &mut photos).await;

    ipc::send_success(id, json!({ "photos": photos }));
}

pub async fn download_photo(id: &str, params: DownloadPhotoParams) {
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

    let provider = device.to_provider(UsbmuxdAddr::default(), "kani-isideload");

    let client = match AfcClient::connect(&provider).await {
        Ok(c) => c,
        Err(e) => {
            ipc::send_error(id, "DEVICE_ERROR", &format!("Failed to connect AFC service: {e}"));
            return;
        }
    };

    let mut file = match client.open_owned(&params.remote_path, AfcFopenMode::RdOnly).await {
        Ok(f) => f,
        Err(e) => {
            ipc::send_error(id, "AFC_ERROR", &format!("Failed to open file: {e}"));
            return;
        }
    };

    let dest_path = Path::new(&params.local_dest);
    if let Some(parent) = dest_path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            ipc::send_error(id, "IO_ERROR", &format!("Failed to create destination directory: {e}"));
            return;
        }
    }

    let mut dest_file = match std::fs::File::create(dest_path) {
        Ok(f) => f,
        Err(e) => {
            ipc::send_error(id, "IO_ERROR", &format!("Failed to create destination file: {e}"));
            return;
        }
    };

    let mut buf = vec![0u8; 1024 * 1024]; // 1 MB chunks
    let mut bytes_written: u64 = 0;

    loop {
        match file.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                if let Err(e) = std::io::Write::write_all(&mut dest_file, &buf[..n]) {
                    ipc::send_error(id, "IO_ERROR", &format!("Failed to write to destination: {e}"));
                    return;
                }
                bytes_written += n as u64;
            }
            Err(e) => {
                ipc::send_error(id, "AFC_ERROR", &format!("Failed to read from device: {e}"));
                return;
            }
        }
    }

    ipc::send_success(
        id,
        json!({ "dest": params.local_dest, "bytesWritten": bytes_written }),
    );
}

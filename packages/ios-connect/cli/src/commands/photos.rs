use serde_json::json;
use std::path::Path;
use tokio::io::AsyncReadExt;

use idevice::IdeviceService;
use idevice::afc::{AfcClient, opcode::AfcFopenMode};
use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};

use crate::ipc;
use crate::types::{DownloadPhotoParams, GetPhotoInfoParams, ListPhotosParams};

const DEFAULT_LIMIT: usize = 200;

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

/// Parse a cursor path like "/DCIM/101APPLE/IMG_1834.HEIC" into ("101APPLE", "IMG_1834.HEIC").
fn parse_cursor(cursor: &Option<String>) -> Option<(String, String)> {
    let cursor = cursor.as_deref()?;
    let rest = cursor.strip_prefix("/DCIM/")?;
    let (album, file) = rest.split_once('/')?;
    Some((album.to_string(), file.to_string()))
}

/// Walk DCIM in newest-first order (descending album, descending filename within album).
/// No get_file_info calls — listing only. Returns collected paths and next-page cursor.
///
/// Cursor semantics: cursor = last path returned on the previous page.
/// Resume by skipping all entries that were already returned:
///   - albums with name > cursor_album (already delivered, higher number = newer)
///   - within cursor_album: files with name >= cursor_file (already delivered)
async fn paginate_photos(
    client: &mut AfcClient,
    limit: usize,
    cursor: &Option<String>,
) -> (Vec<String>, Option<String>) {
    let cursor_parsed = parse_cursor(cursor);

    let mut album_dirs = match client.list_dir("/DCIM").await {
        Ok(e) => e,
        Err(_) => return (vec![], None),
    };

    album_dirs.sort_unstable_by(|a, b| b.cmp(a)); // descending: 101APPLE before 100APPLE

    let mut photos: Vec<String> = Vec::new();

    let (cursor_album, cursor_file) = match &cursor_parsed {
        Some((a, f)) => (Some(a.as_str()), Some(f.as_str())),
        None => (None, None),
    };

    for album in &album_dirs {
        if album == "." || album == ".." {
            continue;
        }

        // Skip albums with name > cursor_album (already fully delivered on previous pages)
        if let Some(ca) = cursor_album {
            if album.as_str() > ca {
                continue;
            }
        }

        let album_path = format!("/DCIM/{album}");

        let mut files = match client.list_dir(&album_path).await {
            Ok(f) => f,
            Err(_) => continue,
        };

        files.sort_unstable_by(|a, b| b.cmp(a)); // descending: IMG_0234 before IMG_0001

        for file in &files {
            if file == "." || file == ".." || !is_photo_file(file) {
                continue;
            }

            // Within cursor_album, skip files already delivered (name >= cursor_file)
            if let (Some(ca), Some(cf)) = (cursor_album, cursor_file) {
                if album.as_str() == ca && file.as_str() >= cf {
                    continue;
                }
            }

            photos.push(format!("{album_path}/{file}"));

            if photos.len() >= limit {
                let next_cursor = photos.last().cloned();
                return (photos, next_cursor);
            }
        }
    }

    (photos, None) // exhausted all albums — no next page
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

    let limit = params.limit.unwrap_or(DEFAULT_LIMIT);
    let (photos, next_cursor) = paginate_photos(&mut client, limit, &params.cursor).await;

    ipc::send_success(id, json!({ "photos": photos, "nextCursor": next_cursor }));
}

pub async fn get_photo_info(id: &str, params: GetPhotoInfoParams) {
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

    match client.get_file_info(&params.path).await {
        Ok(info) => {
            let modified_ts = info.modified.and_utc().timestamp();
            ipc::send_success(id, json!({ "size": info.size, "modified": modified_ts }));
        }
        Err(e) => {
            ipc::send_error(id, "AFC_ERROR", &format!("Failed to get file info: {e}"));
        }
    }
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

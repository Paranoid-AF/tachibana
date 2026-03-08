use std::path::Path;
use tokio::io::AsyncReadExt;

use idevice::IdeviceService;
use idevice::afc::{AfcClient, opcode::AfcFopenMode};
use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};

use crate::types::{DownloadPhotoResult, ListPhotosPage, PhotoInfo};

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

fn parse_cursor(cursor: &Option<String>) -> Option<(String, String)> {
    let cursor = cursor.as_deref()?;
    let rest = cursor.strip_prefix("/DCIM/")?;
    let (album, file) = rest.split_once('/')?;
    Some((album.to_string(), file.to_string()))
}

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

    album_dirs.sort_unstable_by(|a, b| b.cmp(a));

    let mut photos: Vec<String> = Vec::new();

    let (cursor_album, cursor_file) = match &cursor_parsed {
        Some((a, f)) => (Some(a.as_str()), Some(f.as_str())),
        None => (None, None),
    };

    for album in &album_dirs {
        if album == "." || album == ".." {
            continue;
        }

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

        files.sort_unstable_by(|a, b| b.cmp(a));

        for file in &files {
            if file == "." || file == ".." || !is_photo_file(file) {
                continue;
            }

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

    (photos, None)
}

async fn afc_client(udid: &str) -> napi::Result<AfcClient> {
    let mut conn = UsbmuxdConnection::default()
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect to usbmuxd: {e}")))?;

    let device = conn
        .get_device(udid)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Device not found: {e}")))?;

    let provider = device.to_provider(UsbmuxdAddr::default(), "kani-isideload");

    AfcClient::connect(&provider)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to connect AFC service: {e}")))
}

pub async fn list_photos(
    udid: &str,
    limit: Option<usize>,
    cursor: Option<String>,
) -> napi::Result<ListPhotosPage> {
    let mut client = afc_client(udid).await?;
    let limit = limit.unwrap_or(DEFAULT_LIMIT);
    let (photos, next_cursor) = paginate_photos(&mut client, limit, &cursor).await;
    Ok(ListPhotosPage { photos, next_cursor })
}

pub async fn get_photo_info(udid: &str, path: &str) -> napi::Result<PhotoInfo> {
    let mut client = afc_client(udid).await?;
    let info = client
        .get_file_info(path)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to get file info: {e}")))?;

    let modified_ts = info.modified.and_utc().timestamp();
    Ok(PhotoInfo {
        size: info.size as i64,
        modified: modified_ts,
    })
}

pub async fn download_photo(
    udid: &str,
    remote_path: &str,
    local_dest: &str,
) -> napi::Result<DownloadPhotoResult> {
    let client = afc_client(udid).await?;

    let mut file = client
        .open_owned(remote_path, AfcFopenMode::RdOnly)
        .await
        .map_err(|e| napi::Error::from_reason(format!("Failed to open file: {e}")))?;

    let dest_path = Path::new(local_dest);
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            napi::Error::from_reason(format!("Failed to create destination directory: {e}"))
        })?;
    }

    let mut dest_file = std::fs::File::create(dest_path).map_err(|e| {
        napi::Error::from_reason(format!("Failed to create destination file: {e}"))
    })?;

    let mut buf = vec![0u8; 1024 * 1024];
    let mut bytes_written: u64 = 0;

    loop {
        match file.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                std::io::Write::write_all(&mut dest_file, &buf[..n]).map_err(|e| {
                    napi::Error::from_reason(format!("Failed to write to destination: {e}"))
                })?;
                bytes_written += n as u64;
            }
            Err(e) => {
                return Err(napi::Error::from_reason(format!(
                    "Failed to read from device: {e}"
                )));
            }
        }
    }

    Ok(DownloadPhotoResult {
        dest: local_dest.to_string(),
        bytes_written: bytes_written as i64,
    })
}

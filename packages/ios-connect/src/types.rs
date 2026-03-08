use napi_derive::napi;

#[napi(object)]
pub struct ConnectedDevice {
    pub udid: String,
    pub name: String,
    pub product_type: String,
    pub product_version: String,
}

#[napi(object)]
pub struct Team {
    pub team_id: String,
    pub name: String,
    pub r#type: String,
    pub status: String,
}

#[napi(object)]
pub struct Cert {
    pub serial_number: String,
    pub name: String,
    pub expiration_date: Option<String>,
}

#[napi(object)]
pub struct AppId {
    pub app_id_id: String,
    pub name: String,
    pub identifier: String,
}

#[napi(object)]
pub struct Device {
    pub udid: String,
    pub name: String,
    pub status: String,
}

#[napi(object)]
pub struct SessionInfo {
    pub logged_in: bool,
    pub email: Option<String>,
}

#[napi(object)]
pub struct ListPhotosPage {
    pub photos: Vec<String>,
    pub next_cursor: Option<String>,
}

#[napi(object)]
pub struct PhotoInfo {
    pub size: i64,
    pub modified: i64,
}

#[napi(object)]
pub struct DownloadPhotoResult {
    pub dest: String,
    pub bytes_written: i64,
}

#[napi(object)]
pub struct TwoFaInfo {
    pub r#type: String,
}

#[napi(object)]
#[derive(Clone)]
pub struct SessionData {
    pub email: String,
    pub token: String,
    pub duration: u32,
    pub expiry: u32,
    pub adsid: String,
}

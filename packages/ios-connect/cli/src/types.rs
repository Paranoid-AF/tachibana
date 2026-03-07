use serde::{Deserialize, Serialize};

/// Incoming request from TypeScript
#[derive(Debug, Deserialize)]
pub struct IpcRequest {
    pub id: String,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

/// Successful response back to TypeScript
#[derive(Debug, Serialize)]
pub struct IpcSuccess {
    pub id: String,
    pub result: serde_json::Value,
}

/// Error response back to TypeScript
#[derive(Debug, Serialize)]
pub struct IpcError {
    pub id: String,
    pub error: IpcErrorDetail,
}

#[derive(Debug, Serialize)]
pub struct IpcErrorDetail {
    pub code: String,
    pub message: String,
}

/// Unsolicited event from Rust to TypeScript (no id)
#[derive(Debug, Serialize)]
pub struct IpcEvent {
    pub event: String,
    pub data: serde_json::Value,
}

/// Union type for anything we send to TypeScript
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum IpcOutgoing {
    Success(IpcSuccess),
    Error(IpcError),
    Event(IpcEvent),
}

impl IpcOutgoing {
    pub fn success(id: &str, result: serde_json::Value) -> Self {
        IpcOutgoing::Success(IpcSuccess {
            id: id.to_string(),
            result,
        })
    }

    pub fn error(id: &str, code: &str, message: &str) -> Self {
        IpcOutgoing::Error(IpcError {
            id: id.to_string(),
            error: IpcErrorDetail {
                code: code.to_string(),
                message: message.to_string(),
            },
        })
    }

    pub fn event(event: &str, data: serde_json::Value) -> Self {
        IpcOutgoing::Event(IpcEvent {
            event: event.to_string(),
            data,
        })
    }
}

// ── Request parameter types ──────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct LoginParams {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct Submit2faParams {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct TeamIdParams {
    #[serde(rename = "teamId")]
    pub team_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RevokeCertParams {
    #[serde(rename = "serialNumber")]
    pub serial_number: String,
    #[serde(rename = "teamId")]
    pub team_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAppIdParams {
    #[serde(rename = "bundleId")]
    pub bundle_id: String,
    pub name: String,
    #[serde(rename = "teamId")]
    pub team_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RegisterDeviceParams {
    pub udid: String,
    pub name: String,
    #[serde(rename = "teamId")]
    pub team_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SignAppParams {
    #[serde(rename = "appPath")]
    pub app_path: String,
    #[serde(rename = "teamId")]
    pub team_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InstallAppParams {
    #[serde(rename = "appPath")]
    pub app_path: String,
    pub udid: String,
    #[serde(rename = "teamId")]
    pub team_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ScreenshotParams {
    pub udid: String,
    #[serde(rename = "outputPath")]
    pub output_path: String,
}

#[derive(Debug, Deserialize)]
pub struct ListPhotosParams {
    pub udid: String,
}

#[derive(Debug, Deserialize)]
pub struct DownloadPhotoParams {
    pub udid: String,
    #[serde(rename = "remotePath")]
    pub remote_path: String,
    #[serde(rename = "localDest")]
    pub local_dest: String,
}
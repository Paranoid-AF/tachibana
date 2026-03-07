use std::sync::Arc;
use tokio::sync::Mutex;

use crate::commands;
use crate::ipc;
use crate::session::SessionState;
use crate::types::{
    IpcRequest, LoginParams, Submit2faParams, TeamIdParams, RevokeCertParams, CreateAppIdParams,
    RegisterDeviceParams, SignAppParams, InstallAppParams, ScreenshotParams,
    ListPhotosParams, DownloadPhotoParams,
};

pub async fn dispatch(state: Arc<Mutex<SessionState>>, request: IpcRequest) {
    let id = request.id.clone();

    match request.method.as_str() {
        "login" => match serde_json::from_value::<LoginParams>(request.params) {
            Ok(params) => commands::auth::login(state, &id, params).await,
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "submit2fa" => match serde_json::from_value::<Submit2faParams>(request.params) {
            Ok(params) => {
                let mut state = state.lock().await;
                commands::auth::submit_2fa(&mut state, &id, params);
            }
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "getSessionInfo" => {
            let state = state.lock().await;
            commands::auth::session_info(&state, &id);
        }

        "listTeams" => {
            let mut state = state.lock().await;
            commands::teams::list(&mut state, &id).await;
        }

        "listCerts" => match serde_json::from_value::<TeamIdParams>(request.params) {
            Ok(params) => {
                let mut state = state.lock().await;
                commands::certs::list(&mut state, &id, params).await;
            }
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "revokeCert" => match serde_json::from_value::<RevokeCertParams>(request.params) {
            Ok(params) => {
                let mut state = state.lock().await;
                commands::certs::revoke(&mut state, &id, params).await;
            }
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "listAppIds" => match serde_json::from_value::<TeamIdParams>(request.params) {
            Ok(params) => {
                let mut state = state.lock().await;
                commands::app_ids::list(&mut state, &id, params).await;
            }
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "createAppId" => match serde_json::from_value::<CreateAppIdParams>(request.params) {
            Ok(params) => {
                let mut state = state.lock().await;
                commands::app_ids::create(&mut state, &id, params).await;
            }
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "listDevices" => match serde_json::from_value::<TeamIdParams>(request.params) {
            Ok(params) => {
                let mut state = state.lock().await;
                commands::devices::list(&mut state, &id, params).await;
            }
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "registerDevice" => match serde_json::from_value::<RegisterDeviceParams>(request.params) {
            Ok(params) => {
                let mut state = state.lock().await;
                commands::devices::register(&mut state, &id, params).await;
            }
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "listConnectedDevices" => {
            commands::devices::list_connected(&id).await;
        }

        "signApp" => match serde_json::from_value::<SignAppParams>(request.params) {
            Ok(params) => {
                let mut state = state.lock().await;
                commands::sideload::sign(&mut state, &id, params).await;
            }
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "installApp" => match serde_json::from_value::<InstallAppParams>(request.params) {
            Ok(params) => {
                let mut state = state.lock().await;
                commands::sideload::install(&mut state, &id, params).await;
            }
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "screenshot" => match serde_json::from_value::<ScreenshotParams>(request.params) {
            Ok(params) => commands::screenshots::screenshot(&id, params).await,
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "listPhotos" => match serde_json::from_value::<ListPhotosParams>(request.params) {
            Ok(params) => commands::photos::list_photos(&id, params).await,
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "downloadPhoto" => match serde_json::from_value::<DownloadPhotoParams>(request.params) {
            Ok(params) => commands::photos::download_photo(&id, params).await,
            Err(e) => ipc::send_error(&id, "INVALID_PARAMS", &format!("Invalid params: {e}")),
        },

        "shutdown" => {
            ipc::send_success(&id, serde_json::json!({ "success": true }));
            std::process::exit(0);
        }

        unknown => {
            ipc::send_error(
                &id,
                "UNKNOWN_METHOD",
                &format!("Unknown method: {unknown}"),
            );
        }
    }
}

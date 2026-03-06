use serde_json::json;

use isideload::dev::app_ids::AppIdsApi;
use isideload::dev::teams::TeamsApi;

use crate::ipc;
use crate::session::{self, SessionState};
use crate::types::{CreateAppIdParams, TeamIdParams};

pub async fn list(state: &mut SessionState, id: &str, params: TeamIdParams) {
    let session = match state.dev_session.as_mut() {
        Some(s) => s,
        None => {
            ipc::send_error(id, "AUTH_REQUIRED", "Not logged in. Call 'login' first.");
            return;
        }
    };

    let teams = match session.list_teams().await {
        Ok(t) => t,
        Err(e) => {
            ipc::send_error(id, "TEAM_ERROR", &format!("Failed to list teams: {e}"));
            return;
        }
    };

    let team = match session::select_team(teams, params.team_id.as_deref()) {
        Some(t) => t,
        None => {
            ipc::send_error(id, "TEAM_ERROR", "No matching developer team found");
            return;
        }
    };

    match session.list_app_ids(&team, None::<isideload::dev::device_type::DeveloperDeviceType>).await {
        Ok(response) => {
            let ids_json: Vec<_> = response
                .app_ids
                .iter()
                .map(|a| {
                    json!({
                        "appIdId": a.app_id_id,
                        "name": a.name,
                        "identifier": a.identifier,
                    })
                })
                .collect();
            ipc::send_success(id, json!({ "appIds": ids_json }));
        }
        Err(e) => {
            ipc::send_error(id, "APP_ID_ERROR", &format!("Failed to list app IDs: {e}"));
        }
    }
}

pub async fn create(state: &mut SessionState, id: &str, params: CreateAppIdParams) {
    let session = match state.dev_session.as_mut() {
        Some(s) => s,
        None => {
            ipc::send_error(id, "AUTH_REQUIRED", "Not logged in. Call 'login' first.");
            return;
        }
    };

    let teams = match session.list_teams().await {
        Ok(t) => t,
        Err(e) => {
            ipc::send_error(id, "TEAM_ERROR", &format!("Failed to list teams: {e}"));
            return;
        }
    };

    let team = match session::select_team(teams, params.team_id.as_deref()) {
        Some(t) => t,
        None => {
            ipc::send_error(id, "TEAM_ERROR", "No matching developer team found");
            return;
        }
    };

    match session
        .add_app_id(&team, &params.name, &params.bundle_id, None::<isideload::dev::device_type::DeveloperDeviceType>)
        .await
    {
        Ok(app_id) => {
            ipc::send_success(
                id,
                json!({
                    "appId": {
                        "appIdId": app_id.app_id_id,
                        "name": app_id.name,
                        "identifier": app_id.identifier,
                    }
                }),
            );
        }
        Err(e) => {
            ipc::send_error(
                id,
                "APP_ID_ERROR",
                &format!("Failed to create app ID: {e}"),
            );
        }
    }
}

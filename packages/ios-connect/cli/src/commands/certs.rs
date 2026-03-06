use serde_json::json;

use isideload::dev::certificates::CertificatesApi;
use isideload::dev::teams::TeamsApi;

use crate::ipc;
use crate::session::{self, SessionState};
use crate::types::{RevokeCertParams, TeamIdParams};

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

    match session.list_all_development_certs(&team, None::<isideload::dev::device_type::DeveloperDeviceType>).await {
        Ok(certs) => {
            let certs_json: Vec<_> = certs
                .iter()
                .map(|c| {
                    json!({
                        "serialNumber": c.serial_number,
                        "name": c.machine_name,
                        "expirationDate": c.expiration_date.as_ref().map(|d| format!("{d:?}")),
                    })
                })
                .collect();
            ipc::send_success(id, json!({ "certs": certs_json }));
        }
        Err(e) => {
            ipc::send_error(id, "CERT_ERROR", &format!("Failed to list certificates: {e}"));
        }
    }
}

pub async fn revoke(state: &mut SessionState, id: &str, params: RevokeCertParams) {
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
        .revoke_development_cert(&team, &params.serial_number, None::<isideload::dev::device_type::DeveloperDeviceType>)
        .await
    {
        Ok(_) => {
            ipc::send_success(id, json!({ "success": true }));
        }
        Err(e) => {
            ipc::send_error(
                id,
                "CERT_ERROR",
                &format!("Failed to revoke certificate: {e}"),
            );
        }
    }
}

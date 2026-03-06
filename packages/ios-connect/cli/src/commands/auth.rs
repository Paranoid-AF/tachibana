use std::sync::Arc;

use serde_json::json;

use isideload::anisette::remote_v3::RemoteV3AnisetteProvider;
use isideload::auth::apple_account::AppleAccount;
use isideload::dev::developer_session::DeveloperSession;
use tokio::sync::Mutex;

use crate::ipc;
use crate::session::SessionState;
use crate::types::{LoginParams, Submit2faParams};

/// Login takes Arc<Mutex<State>> directly (not &mut State) because it needs
/// to release the lock while awaiting the login call. This allows the IPC
/// loop to process `submit2fa` concurrently.
pub async fn login(state: Arc<Mutex<SessionState>>, id: &str, params: LoginParams) {
    let anisette_url = {
        let st = state.lock().await;
        st.anisette_url.clone()
    };
    let anisette = match anisette_url {
        Some(url) => RemoteV3AnisetteProvider::default().set_url(&url),
        None => RemoteV3AnisetteProvider::default(),
    };

    let mut account = match AppleAccount::builder(&params.email)
        .anisette_provider(anisette)
        .build()
        .await
    {
        Ok(a) => a,
        Err(e) => {
            ipc::send_error(id, "AUTH_FAILED", &format!("Failed to create account: {e}"));
            return;
        }
    };

    // Create a std::sync::mpsc channel for 2FA code.
    // We use sync mpsc (not tokio::oneshot) so the callback can block
    // via recv() without needing tokio runtime (avoids block_on panic).
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let session_id = uuid::Uuid::new_v4().to_string();

    {
        let mut st = state.lock().await;
        st.pending_2fa.insert(session_id.clone(), tx);
    }

    // Wrap rx in Arc<Mutex<Option<...>>> so the closure is Sync + Send.
    // The Receiver is taken out once; subsequent calls return None.
    let rx_slot = Arc::new(std::sync::Mutex::new(Some(rx)));
    let sid = session_id.clone();

    let two_fa_callback = move || -> Option<String> {
        // Emit 2fa_required event to TypeScript
        ipc::send_event(
            "2fa_required",
            json!({ "sessionId": sid, "type": "trustedDevice" }),
        );

        // Take the receiver out of the slot (only works once)
        let rx = {
            let mut guard = rx_slot.lock().ok()?;
            guard.take()?
        };

        // Block the current thread (NOT the tokio runtime) until
        // TypeScript sends submit2fa. block_in_place tells tokio to
        // move other tasks off this worker thread while we block.
        tokio::task::block_in_place(|| rx.recv().ok())
    };

    match account.login(&params.password, two_fa_callback).await {
        Ok(_) => {}
        Err(e) => {
            let mut st = state.lock().await;
            st.pending_2fa.remove(&session_id);
            ipc::send_error(id, "AUTH_FAILED", &format!("Login failed: {e}"));
            return;
        }
    }

    // Create developer session from authenticated account
    match DeveloperSession::from_account(&mut account).await {
        Ok(session) => {
            let mut st = state.lock().await;
            st.account = Some(account);
            st.dev_session = Some(session);
            ipc::send_success(id, json!({ "loggedIn": true }));
        }
        Err(e) => {
            let mut st = state.lock().await;
            st.account = Some(account);
            ipc::send_error(
                id,
                "AUTH_FAILED",
                &format!("Login succeeded but failed to create developer session: {e}"),
            );
        }
    }
}

/// Submit 2FA code — synchronous, no async needed.
pub fn submit_2fa(state: &mut SessionState, id: &str, params: Submit2faParams) {
    match state.pending_2fa.remove(&params.session_id) {
        Some(sender) => {
            if sender.send(params.code).is_ok() {
                ipc::send_success(id, json!({ "success": true }));
            } else {
                ipc::send_error(id, "2FA_ERROR", "2FA receiver was dropped");
            }
        }
        None => {
            ipc::send_error(
                id,
                "2FA_ERROR",
                &format!("No pending 2FA session: {}", params.session_id),
            );
        }
    }
}

pub fn session_info(state: &SessionState, id: &str) {
    let logged_in = state.is_logged_in();
    let email = state
        .account
        .as_ref()
        .map(|a: &AppleAccount| a.email.clone());

    ipc::send_success(
        id,
        json!({
            "loggedIn": logged_in,
            "email": email,
        }),
    );
}

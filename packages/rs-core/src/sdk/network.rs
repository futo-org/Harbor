//! One-off server calls that need the active login or fan out across the
//! configured servers.

use polycentric_common::models::protos_v2::{
    AcknowledgeNotificationsRequest, DeleteContentRequest, EventKey, GetServerInfoResponse,
    RegisterPushNotificationRequest, ResolveReportRequest, SetBanStatusRequest, SignedMessage,
    UrlInfoResponse,
};
use prost::Message;

use crate::sdk::client::Client;
use crate::sdk::error::{SdkError, SdkResult};

impl Client {
    /// Link-preview metadata for `url` from the first server that answers.
    pub async fn url_info(&self, url: &str) -> Option<UrlInfoResponse> {
        for server in self.servers() {
            if let Ok(bytes) = self.inner.core.url_info(server, url.to_string()).await
                && let Ok(info) = UrlInfoResponse::decode(bytes.as_slice())
            {
                return Some(info);
            }
        }
        None
    }

    pub async fn get_server_info(&self, server: &str) -> SdkResult<GetServerInfoResponse> {
        let bytes = self.inner.core.get_server_info(server.to_string()).await?;
        Ok(GetServerInfoResponse::decode(bytes.as_slice())?)
    }

    /// Ban or unban `target_identity` on `server`. The active identity must
    /// moderate it.
    pub async fn set_ban_status(
        &self,
        server: &str,
        target_identity: &str,
        banned: bool,
    ) -> SdkResult<()> {
        let request = SetBanStatusRequest {
            target_identity: target_identity.to_string(),
            banned,
        };
        self.inner
            .core
            .set_ban_status(server.to_string(), request.encode_to_vec())
            .await?;
        Ok(())
    }

    /// Resolve, dismiss or reopen a report on `server`.
    pub async fn resolve_report(&self, server: &str, report_id: i64, status: i32) -> SdkResult<()> {
        let request = ResolveReportRequest { report_id, status };
        self.inner
            .core
            .resolve_report(server.to_string(), request.encode_to_vec())
            .await?;
        Ok(())
    }

    /// Erase an event from `server`.
    pub async fn delete_content(&self, server: &str, target: EventKey) -> SdkResult<()> {
        let request = DeleteContentRequest {
            target: Some(target),
        };
        self.inner
            .core
            .delete_content(server.to_string(), request.encode_to_vec())
            .await?;
        Ok(())
    }

    /// Mark the active identity's notifications read on every configured
    /// server, up to `last_seen`. Failures are logged, not returned.
    pub async fn acknowledge_notifications(&self, last_seen: EventKey) {
        let request = AcknowledgeNotificationsRequest {
            last_seen: Some(last_seen),
        }
        .encode_to_vec();
        let calls = self.servers().into_iter().map(|server| {
            let request = request.clone();
            async move {
                if let Err(e) = self
                    .inner
                    .core
                    .acknowledge_notifications(server.clone(), request)
                    .await
                {
                    crate::logging::log_warn(|| {
                        format!("acknowledge_notifications failed for {server}: {e}")
                    });
                }
            }
        });
        futures::future::join_all(calls).await;
    }

    /// Sign `request` with the active key and register it on each of
    /// `servers`. Failures are logged, not returned.
    pub async fn register_push_notifications(
        &self,
        servers: Vec<String>,
        request: RegisterPushNotificationRequest,
    ) -> SdkResult<()> {
        let login = self.active_login().ok_or(SdkError::NoActiveKeyPair)?;
        let message_bytes = request.encode_to_vec();
        let signed = SignedMessage {
            signature: login.key_pair.sign(&message_bytes),
            message_bytes,
            public_key: Some(login.key_pair.public_key()),
        }
        .encode_to_vec();
        let calls = servers.into_iter().map(|server| {
            let signed = signed.clone();
            async move {
                if let Err(e) = self
                    .inner
                    .core
                    .register_push_notifications(server.clone(), signed)
                    .await
                {
                    crate::logging::log_warn(|| {
                        format!("register_push_notifications failed for {server}: {e}")
                    });
                }
            }
        });
        futures::future::join_all(calls).await;
        Ok(())
    }
}

/// Resolve an alias (`user@domain.com`) to an identity through the
/// domain's `/.well-known/polycentric.json`. `None` when the alias is
/// malformed, the lookup fails, or the domain doesn't list it.
pub async fn resolve_alias(alias: &str) -> Option<String> {
    let parsed = polycentric_common::alias::parse_alias(alias)?;
    match crate::sdk::http::get(&parsed.lookup_url(), Some("application/json")).await {
        Ok(Some(body)) => polycentric_common::alias::identity_from_document(&parsed, &body),
        Ok(None) => None,
        Err(e) => {
            crate::logging::log_warn(|| format!("alias lookup failed for {}: {e}", parsed.acct));
            None
        }
    }
}

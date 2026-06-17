use serde::{Deserialize, Serialize};

use crate::manager::NotificationError;

const DEFAULT_EXPO_PUSH_URL: &str = "https://exp.host/--/api/v2/push/send";

#[derive(Serialize)]
pub struct ExpoPushRequest {
    pub to: Vec<String>,
    pub title: String,
    pub body: String,
    // struct is camelCase via the field name already; rename to be explicit.
    #[serde(rename = "collapseId", skip_serializing_if = "Option::is_none")]
    pub collapse_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<ExpoPushData>,
    #[serde(rename = "richContent", skip_serializing_if = "Option::is_none")]
    pub rich_content: Option<ExpoRichContent>,
}

#[derive(Serialize)]
pub struct ExpoPushData {
    pub url: String,
}

/// Rich media attached to a push — the expanded notification image (e.g. the
/// author's avatar). `image` is a public, fetchable URL.
#[derive(Serialize)]
pub struct ExpoRichContent {
    pub image: String,
}

#[derive(Deserialize)]
pub struct ExpoPushResponse {
    pub data: Vec<ExpoPushTicket>,
}

#[derive(Deserialize)]
pub struct ExpoPushTicket {
    pub status: String,
    #[serde(default)]
    pub details: Option<ExpoTicketDetails>,
}

#[derive(Deserialize)]
pub struct ExpoTicketDetails {
    #[serde(default)]
    pub error: Option<String>,
}

pub struct ExpoClient {
    http: reqwest::Client,
    access_token: Option<String>,
    push_url: String,
}

impl ExpoClient {
    pub fn new(access_token: Option<String>) -> Self {
        ExpoClient {
            http: reqwest::Client::new(),
            access_token,
            push_url: DEFAULT_EXPO_PUSH_URL.to_string(),
        }
    }

    #[cfg(test)]
    pub fn with_custom_push_url(access_token: Option<String>, push_url: String) -> Self {
        ExpoClient {
            http: reqwest::Client::new(),
            access_token,
            push_url,
        }
    }

    pub async fn post_requests(
        &self,
        requests: Vec<ExpoPushRequest>,
    ) -> Result<ExpoPushResponse, NotificationError> {
        let mut builder = self.http.post(&self.push_url).json(&requests);
        if let Some(token) = &self.access_token {
            builder = builder.bearer_auth(token);
        }

        let response: ExpoPushResponse = builder
            .send()
            .await
            .map_err(|e| NotificationError::PushService(e.to_string()))?
            .error_for_status()
            .map_err(|e| NotificationError::PushService(e.to_string()))?
            .json()
            .await
            .map_err(|e| NotificationError::PushService(e.to_string()))?;

        Ok(response)
    }
}

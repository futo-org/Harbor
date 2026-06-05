//! Client for the Azure AI Content Safety API.
//!
//! Azure exposes three analysis "buckets", each its own endpoint:
//!   - text only            -> `text:analyze`
//!   - image only           -> `image:analyze`
//!   - image *with* text    -> `imageWithText:analyze` (multimodal)
//!
//! Each call returns that bucket's raw JSON response unchanged; callers
//! interpret the category scores. This module is transport only.

use std::env;

use base64::Engine as _;
use serde_json::Value;

/// API version for the GA text/image endpoints.
const DEFAULT_API_VERSION: &str = "2024-09-01";
/// The multimodal (`imageWithText`) endpoint is preview-only.
const DEFAULT_MULTIMODAL_API_VERSION: &str = "2024-09-15-preview";

const ENV_ENDPOINT: &str = "POLYCENTRIC_AZURE_CONTENT_SAFETY_ENDPOINT";
const ENV_KEY: &str = "POLYCENTRIC_AZURE_CONTENT_SAFETY_KEY";
const ENV_API_VERSION: &str = "POLYCENTRIC_AZURE_CONTENT_SAFETY_API_VERSION";
const ENV_MULTIMODAL_API_VERSION: &str = "POLYCENTRIC_AZURE_CONTENT_SAFETY_MULTIMODAL_API_VERSION";

#[derive(Debug)]
pub enum AzureError {
    /// Required configuration (endpoint/key) was missing.
    Config(String),
    /// The HTTP request itself failed (connection, timeout, decode, ...).
    Http(reqwest::Error),
    /// Azure responded with a non-success status; carries the raw body.
    Api { status: u16, body: String },
}

impl std::fmt::Display for AzureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AzureError::Config(msg) => {
                write!(f, "azure content safety not configured: {msg}")
            }
            AzureError::Http(e) => write!(f, "azure request failed: {e}"),
            AzureError::Api { status, body } => {
                write!(f, "azure returned status {status}: {body}")
            }
        }
    }
}

impl std::error::Error for AzureError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            AzureError::Http(e) => Some(e),
            _ => None,
        }
    }
}

impl From<reqwest::Error> for AzureError {
    fn from(e: reqwest::Error) -> Self {
        AzureError::Http(e)
    }
}

/// Which analysis bucket to submit. Mirrors Azure's three endpoints.
pub enum ModerationRequest<'a> {
    /// Text-only analysis (`text:analyze`).
    Text(&'a str),
    /// Image-only analysis (`image:analyze`).
    Image(&'a [u8]),
    /// Multimodal analysis of an image together with associated text
    /// (`imageWithText:analyze`).
    ImageWithText { image: &'a [u8], text: &'a str },
}

impl<'a> ModerationRequest<'a> {
    /// Pick the appropriate bucket from whatever modalities are present.
    /// Empty/blank inputs are ignored. Returns `None` when there is
    /// nothing to analyze.
    pub fn from_parts(text: Option<&'a str>, image: Option<&'a [u8]>) -> Option<Self> {
        let text = text.filter(|t| !t.trim().is_empty());
        let image = image.filter(|i| !i.is_empty());
        match (text, image) {
            (Some(text), Some(image)) => Some(ModerationRequest::ImageWithText { image, text }),
            (None, Some(image)) => Some(ModerationRequest::Image(image)),
            (Some(text), None) => Some(ModerationRequest::Text(text)),
            (None, None) => None,
        }
    }
}

pub struct AzureClient {
    http: reqwest::Client,
    /// Resource endpoint without a trailing slash, e.g.
    /// `https://<resource>.cognitiveservices.azure.com`.
    endpoint: String,
    api_key: String,
    api_version: String,
    multimodal_api_version: String,
}

impl AzureClient {
    /// Build a client from explicit configuration.
    pub fn new(
        endpoint: impl Into<String>,
        api_key: impl Into<String>,
        api_version: impl Into<String>,
        multimodal_api_version: impl Into<String>,
    ) -> Self {
        let endpoint = endpoint.into().trim_end_matches('/').to_string();
        AzureClient {
            http: reqwest::Client::new(),
            endpoint,
            api_key: api_key.into(),
            api_version: api_version.into(),
            multimodal_api_version: multimodal_api_version.into(),
        }
    }

    /// Build a client from the environment. Requires
    /// `AZURE_CONTENT_SAFETY_ENDPOINT` and `AZURE_CONTENT_SAFETY_KEY`; the
    /// api-version variables are optional.
    pub fn from_env() -> Result<Self, AzureError> {
        let endpoint = env::var(ENV_ENDPOINT)
            .map_err(|_| AzureError::Config(format!("{ENV_ENDPOINT} is not set")))?;
        let api_key =
            env::var(ENV_KEY).map_err(|_| AzureError::Config(format!("{ENV_KEY} is not set")))?;
        let api_version =
            env::var(ENV_API_VERSION).unwrap_or_else(|_| DEFAULT_API_VERSION.to_string());
        let multimodal_api_version = env::var(ENV_MULTIMODAL_API_VERSION)
            .unwrap_or_else(|_| DEFAULT_MULTIMODAL_API_VERSION.to_string());

        Ok(AzureClient::new(
            endpoint,
            api_key,
            api_version,
            multimodal_api_version,
        ))
    }

    /// Submit a single bucket and return Azure's raw JSON response.
    pub async fn analyze(&self, request: ModerationRequest<'_>) -> Result<Value, AzureError> {
        match request {
            ModerationRequest::Text(text) => {
                let url = format!("{}/contentsafety/text:analyze", self.endpoint);
                self.post(&url, &self.api_version, serde_json::json!({ "text": text }))
                    .await
            }
            ModerationRequest::Image(image) => {
                let url = format!("{}/contentsafety/image:analyze", self.endpoint);
                self.post(
                    &url,
                    &self.api_version,
                    serde_json::json!({ "image": { "content": encode(image) } }),
                )
                .await
            }
            ModerationRequest::ImageWithText { image, text } => {
                let url = format!("{}/contentsafety/imageWithText:analyze", self.endpoint);
                self.post(
                    &url,
                    &self.multimodal_api_version,
                    serde_json::json!({
                        "image": { "content": encode(image) },
                        "text": text,
                        // Also analyze any text Azure's OCR finds in the image.
                        "enableOcr": true,
                    }),
                )
                .await
            }
        }
    }

    async fn post(&self, url: &str, api_version: &str, body: Value) -> Result<Value, AzureError> {
        let response = self
            .http
            .post(url)
            .query(&[("api-version", api_version)])
            .header("Ocp-Apim-Subscription-Key", &self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(AzureError::Api {
                status: status.as_u16(),
                body,
            });
        }

        Ok(response.json().await?)
    }
}

fn encode(image: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(image)
}

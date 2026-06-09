//! Client for the Microsoft PhotoDNA Cloud Service.
//!
//! Uses the PhotoDNA REST API to match image hashes against known CSAM. This module submits images
//! and returns match responses; callers act on the returned match.

use base64::{Engine as _, engine::general_purpose::STANDARD as Base64Engine};
use serde_json::Value;
use std::{
    env,
    error::Error,
    fmt::{self, Display, Formatter},
};

const ENV_KEY: &str = "POLYCENTRIC_PHOTODNA_KEY";
const ENV_ENDPOINT: &str = "POLYCENTRIC_PHOTODNA_ENDPOINT";
const DEFAULT_ENDPOINT: &str = "https://api.microsoftmoderator.com/photodna/v1.0";

#[derive(Debug)]
pub enum PhotoDnaError {
    /// Required configuration (subscription key) was missing.
    Config(String),
    /// The HTTP request itself failed (connection, timeout, decode, ...).
    Http(reqwest::Error),
    /// PhotoDNA responded with a non-success status; carries the raw body.
    Api { status: u16, body: String },
    /// The response was 2xx but did not carry a usable `IsMatch` field.
    Malformed(String),
}

impl Display for PhotoDnaError {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        match self {
            PhotoDnaError::Config(msg) => {
                write!(f, "photodna not configured: {msg}")
            }
            PhotoDnaError::Http(e) => write!(f, "photodna request failed: {e}"),
            PhotoDnaError::Api { status, body } => {
                write!(f, "photodna returned status {status}: {body}")
            }
            PhotoDnaError::Malformed(msg) => {
                write!(f, "photodna response malformed: {msg}")
            }
        }
    }
}

impl Error for PhotoDnaError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            PhotoDnaError::Http(e) => Some(e),
            _ => None,
        }
    }
}

impl From<reqwest::Error> for PhotoDnaError {
    fn from(e: reqwest::Error) -> Self {
        PhotoDnaError::Http(e)
    }
}

pub struct PhotoDnaClient {
    http: reqwest::Client,
    /// Base URL without a trailing slash, e.g. `https://api.microsoftmoderator.com/photodna/v1.0`.
    endpoint: String,
    subscription_key: String,
    /// PhotoDNA's `enhance` flag — improves matching at extra processing cost.
    enhance: bool,
}

impl PhotoDnaClient {
    /// Build a client from explicit configuration.
    pub fn new(
        endpoint: impl Into<String>,
        subscription_key: impl Into<String>,
        enhance: bool,
    ) -> Self {
        let endpoint = endpoint.into().trim_end_matches('/').to_string();
        PhotoDnaClient {
            http: reqwest::Client::new(),
            endpoint,
            subscription_key: subscription_key.into(),
            enhance,
        }
    }

    /// Build a client from the environment, or return an error if the required
    /// `POLYCENTRIC_PHOTODNA_KEY` is not set. `POLYCENTRIC_PHOTODNA_ENDPOINT` is optional and
    /// falls back to [`DEFAULT_ENDPOINT`].
    pub fn from_env() -> Result<Self, PhotoDnaError> {
        let subscription_key = env::var(ENV_KEY)
            .map_err(|_| PhotoDnaError::Config(format!("{ENV_KEY} is not set")))?;
        let endpoint = env::var(ENV_ENDPOINT).unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string());
        Ok(PhotoDnaClient::new(endpoint, subscription_key, true))
    }

    /// Submit a single image to the `Match` endpoint and return whether
    /// PhotoDNA matched it against the known-CSAM dataset.
    ///
    /// Note that the `Match` endpoint is deprecated, and that Microsoft
    /// recommends using `MatchHash`. The `Match` API better suits our
    /// use case (the image has already been sent to our servers--it's
    /// too late to compute a hash at the edge to prevent it from getting
    /// to the server). We may want to switch to the `MatchHash` endpoint
    /// at some point in the future.
    pub async fn is_match(&self, image: &[u8]) -> Result<bool, PhotoDnaError> {
        let url = format!("{}/Match", self.endpoint);

        let response = self
            .http
            .post(&url)
            .query(&[("enhance", self.enhance)])
            .header("Ocp-Apim-Subscription-Key", &self.subscription_key)
            .json(&serde_json::json!({
                "DataRepresentation": "Binary",
                "Value": Base64Engine.encode(image),
            }))
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(PhotoDnaError::Api {
                status: status.as_u16(),
                body,
            });
        }

        let body: Value = response.json().await?;
        body.get("IsMatch").and_then(Value::as_bool).ok_or_else(|| {
            PhotoDnaError::Malformed(format!("missing/invalid IsMatch field in {body}"))
        })
    }
}

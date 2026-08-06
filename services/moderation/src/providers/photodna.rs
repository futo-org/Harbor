//! Client for the Microsoft PhotoDNA Cloud Service.
//!
//! Uses the PhotoDNA REST API to match image hashes against known CSAM. This module submits images
//! and returns match responses; callers act on the returned match.

use serde_json::Value;
use std::{
    error::Error,
    fmt::{self, Display, Formatter},
};

const PHOTODNA_STATUS_OK: u64 = 3000;

#[derive(Debug)]
pub enum PhotoDnaError {
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

    /// Submit a single image to the `Match` endpoint and return whether
    /// PhotoDNA matched it against the known-CSAM dataset.
    ///
    /// `mime_hint` is the caller's claimed MIME type. See
    /// [`PhotoDnaClient::resolve_content_type`].
    ///
    /// Note that the `Match` endpoint is deprecated, and that Microsoft
    /// recommends using `MatchHash`. The `Match` API better suits our
    /// use case (the image has already been sent to our servers--it's
    /// too late to compute a hash at the edge to prevent it from getting
    /// to the server). We may want to switch to the `MatchHash` endpoint
    /// at some point in the future.
    pub async fn is_match(
        &self,
        image: &[u8],
        mime_hint: Option<&str>,
    ) -> Result<bool, PhotoDnaError> {
        let url = format!("{}/Match", self.endpoint);

        let response = self
            .http
            .post(&url)
            .query(&[("enhance", self.enhance)])
            .header("Ocp-Apim-Subscription-Key", &self.subscription_key)
            .header("Content-Type", Self::resolve_content_type(mime_hint, image))
            .body(image.to_vec())
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

        let code = body
            .get("Status")
            .and_then(|s| s.get("Code"))
            .and_then(Value::as_u64);
        if code != Some(PHOTODNA_STATUS_OK) {
            return Err(PhotoDnaError::Api {
                status: code.unwrap_or(0) as u16,
                body: body.to_string(),
            });
        }

        body.get("IsMatch").and_then(Value::as_bool).ok_or_else(|| {
            PhotoDnaError::Malformed(format!("missing/invalid IsMatch field in {body}"))
        })
    }

    /// Resolve the HTTP `Content-Type` to send to PhotoDNA's `Match` endpoint. Note that PhotoDNA
    /// will usually verify the content type from the image itself, so this step is somewhat of a
    /// formality.
    fn resolve_content_type(mime_hint: Option<&str>, image: &[u8]) -> &'static str {
        if let Some(hint) = mime_hint {
            match hint.trim().to_ascii_lowercase().as_str() {
                "image/jpeg" | "image/jpg" => return "image/jpeg",
                "image/png" => return "image/png",
                "image/gif" => return "image/gif",
                "image/bmp" => return "image/bmp",
                "image/tiff" | "image/tif" => return "image/tiff",
                "image/webp" => return "image/webp",
                _ => {}
            }
        }

        match image {
            [0xFF, 0xD8, 0xFF, ..] => "image/jpeg",
            [0x89, b'P', b'N', b'G', ..] => "image/png",
            [b'G', b'I', b'F', b'8', ..] => "image/gif",
            [b'B', b'M', ..] => "image/bmp",
            [0x49, 0x49, 0x2A, 0x00, ..] | [0x4D, 0x4D, 0x00, 0x2A, ..] => "image/tiff",
            [
                b'R',
                b'I',
                b'F',
                b'F',
                _,
                _,
                _,
                _,
                b'W',
                b'E',
                b'B',
                b'P',
                ..,
            ] => "image/webp",
            _ => "image/jpeg",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{env, path::Path};
    use tokio::time::{Duration, sleep};

    const KEY_ENV: &str = "POLYCENTRIC_PHOTODNA_KEY";
    const TEST_IMAGES_ENV: &str = "POLYCENTRIC_PHOTODNA_TEST_IMAGES";
    const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp"];

    /// Recursively collect paths of files whose extension is in
    /// [`IMAGE_EXTENSIONS`], sorted for deterministic output.
    fn collect_images(dir: &Path) -> Vec<std::path::PathBuf> {
        let mut images = Vec::new();
        let Ok(entries) = std::fs::read_dir(dir) else {
            return images;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                images.extend(collect_images(&path));
            } else if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if IMAGE_EXTENSIONS.iter().any(|v| ext.eq_ignore_ascii_case(v)) {
                        images.push(path);
                    }
                }
            }
        }
        images.sort();
        images
    }

    /// Send images from a directory to the PhotoDNA `Match` endpoint and verify
    /// at least one matches (`IsMatch` is true). Point the directory at known
    /// PhotoDNA test images so that a match is expected.
    ///
    /// Point to the directory with the `POLYCENTRIC_PHOTODNA_TEST_IMAGES`
    /// environment variable (a directory path, not a file path).
    /// `POLYCENTRIC_PHOTODNA_KEY` must also be set.
    ///
    /// Ignored by default because it requires valid PhotoDNA credentials and
    /// the PhotoDNA test images.
    #[tokio::test]
    #[ignore = "Requires POLYCENTRIC_PHOTODNA_KEY + POLYCENTRIC_PHOTODNA_TEST_IMAGES (directory)"]
    async fn photodna_real_api_reports_match() {
        let (Ok(image_dir_str), Ok(key)) = (env::var(TEST_IMAGES_ENV), env::var(KEY_ENV)) else {
            eprintln!("skipping: set {KEY_ENV} + {TEST_IMAGES_ENV} to run");
            return;
        };

        let image_dir = Path::new(&image_dir_str);
        assert!(
            image_dir.is_dir(),
            "POLYCENTRIC_PHOTODNA_TEST_IMAGE must be a directory, got {image_dir_str}"
        );

        let images = collect_images(image_dir);
        assert!(
            !images.is_empty(),
            "no image files found in {image_dir_str}"
        );

        let client = PhotoDnaClient::new(crate::config::DEFAULT_PHOTODNA_ENDPOINT, key, true);

        let mut attempted = 0usize;
        for path in &images {
            let image = match std::fs::read(path) {
                Ok(data) => data,
                Err(e) => {
                    eprintln!("  [{attempted}] {path:?}: skipped (read error: {e})");
                    attempted += 1;
                    continue;
                }
            };

            // No MIME available for files read off disk; let is_match read the file
            // directly to find out.
            match client.is_match(&image, None).await {
                Ok(is_match) => {
                    if is_match {
                        return;
                    }
                }
                Err(e) => {
                    eprintln!("  [{attempted}] {path:?}: API error: {e}");
                    attempted += 1;
                    continue;
                }
            };

            // Sleep after every request so that we don't trigger rate limits
            sleep(Duration::from_millis(500)).await;
        }

        panic!("PhotoDNA did not match any of the images!");
    }
}

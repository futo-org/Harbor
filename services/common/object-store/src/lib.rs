//! S3-compatible blob store shared by the services. Works against AWS
//! S3, Cloudflare R2, RustFS, and other S3-compatible backends.

use std::error::Error;
use std::fmt::Write as _;
use std::io;

use aws_config::{BehaviorVersion, Region};
use aws_sdk_s3::Client;
use aws_sdk_s3::config::Credentials;
use aws_sdk_s3::error::SdkError;
use aws_sdk_s3::primitives::ByteStream;
use polycentric_common::models::protos_v2::ContentDigest;

fn err_chain<E: Error>(e: &E) -> String {
    let mut out = e.to_string();
    let mut src = e.source();
    while let Some(cur) = src {
        let _ = write!(out, ": {cur}");
        src = cur.source();
    }
    out
}

fn sdk_err<E: Error>(e: E) -> io::Error {
    io::Error::other(err_chain(&e))
}

/// Storage key for a blob in the object store. Layout:
/// `{digest_type}_{hex(digest_value)}`.
pub fn blob_key(digest: &ContentDigest) -> String {
    let mut hex = String::with_capacity(digest.value.len() * 2);
    for b in &digest.value {
        let _ = write!(hex, "{b:02x}");
    }
    format!("{}_{}", digest.r#type, hex)
}

/// S3-backed blob store config. When `access_key`/`secret_key` are
/// unset, the AWS SDK's default credential chain is used (shared
/// config, container/EC2 metadata, etc.).
#[derive(Debug, Clone)]
pub struct ObjectStoreConfig {
    pub bucket: String,
    pub region: String,
    pub endpoint: Option<String>,
    /// RustFS and other S3-compatible stores require path-style
    pub force_path_style: bool,
    pub access_key: Option<String>,
    pub secret_key: Option<String>,
}

impl ObjectStoreConfig {
    pub fn from_env() -> Result<Self, String> {
        let bucket = std::env::var("CONTENT_BLOB_OS_BUCKET")
            .map_err(|_| "CONTENT_BLOB_OS_BUCKET is required".to_string())?;
        let region =
            std::env::var("CONTENT_BLOB_OS_REGION").unwrap_or_else(|_| "us-east-1".to_string());
        let endpoint = std::env::var("CONTENT_BLOB_OS_ENDPOINT").ok();
        let force_path_style = std::env::var("CONTENT_BLOB_OS_FORCE_PATH_STYLE")
            .map(|v| matches!(v.as_str(), "true" | "1"))
            .unwrap_or(false);
        let access_key = std::env::var("CONTENT_BLOB_OS_ACCESS_KEY").ok();
        let secret_key = std::env::var("CONTENT_BLOB_OS_SECRET_KEY").ok();
        Ok(Self {
            bucket,
            region,
            endpoint,
            force_path_style,
            access_key,
            secret_key,
        })
    }
}

/// S3-backed blob store. Each body is stored under the configured
/// bucket keyed by `{digest_type}_{hex(digest_value)}`.
#[derive(Debug, Clone)]
pub struct ObjectStore {
    client: Client,
    bucket: String,
}

impl ObjectStore {
    pub async fn new(cfg: ObjectStoreConfig) -> Self {
        let mut loader =
            aws_config::defaults(BehaviorVersion::latest()).region(Region::new(cfg.region));
        if let Some(endpoint) = &cfg.endpoint {
            loader = loader.endpoint_url(endpoint);
        }
        if let (Some(access), Some(secret)) = (cfg.access_key.as_deref(), cfg.secret_key.as_deref())
        {
            loader = loader.credentials_provider(Credentials::new(
                access,
                secret,
                None,
                None,
                "content-blob-os",
            ));
        }
        let aws = loader.load().await;

        let s3_cfg = aws_sdk_s3::config::Builder::from(&aws)
            .force_path_style(cfg.force_path_style)
            .build();

        Self {
            client: Client::from_conf(s3_cfg),
            bucket: cfg.bucket,
        }
    }

    /// Upload `body` under the digest's key. Re-uploading the same
    /// body overwrites the existing object.
    pub async fn write_blob(&self, digest: &ContentDigest, body: Vec<u8>) -> io::Result<()> {
        let key = blob_key(digest);
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(ByteStream::from(body))
            .send()
            .await
            .map_err(sdk_err)?;
        Ok(())
    }

    /// Delete a blob by its digest. Deleting an absent blob is a no-op.
    pub async fn delete_blob(&self, digest: &ContentDigest) -> io::Result<()> {
        let key = blob_key(digest);
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(sdk_err)?;
        Ok(())
    }

    /// Read a blob body by its digest. Returns `NotFound` when the
    /// object does not exist in the bucket.
    pub async fn read_blob(&self, digest: &ContentDigest) -> io::Result<Vec<u8>> {
        let key = blob_key(digest);
        let resp = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| match e {
                SdkError::ServiceError(svc) if svc.err().is_no_such_key() => {
                    io::Error::new(io::ErrorKind::NotFound, "blob not found")
                }
                other => sdk_err(other),
            })?;
        let bytes = resp
            .body
            .collect()
            .await
            .map_err(sdk_err)?
            .into_bytes()
            .to_vec();
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blob_key_formats_sha256_digest() {
        let digest = ContentDigest {
            r#type: 1,
            value: vec![0xab, 0xcd, 0xef],
        };
        assert_eq!(blob_key(&digest), "1_abcdef");
    }

    #[test]
    fn blob_key_handles_empty_value() {
        let digest = ContentDigest {
            r#type: 1,
            value: vec![],
        };
        assert_eq!(blob_key(&digest), "1_");
    }

    #[test]
    fn blob_key_includes_full_32_byte_digest() {
        let digest = ContentDigest {
            r#type: 1,
            value: (0u8..32).collect(),
        };
        let key = blob_key(&digest);
        assert!(key.starts_with("1_"));
        assert_eq!(key.len(), 2 + 64);
    }
}

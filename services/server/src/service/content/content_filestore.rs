use crate::service::proto::ContentDigest;
use crate::util;
use std::io;
use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncWriteExt;

/// Local filesystem-backed blob store. Each body is written to a file
/// keyed by `{digest_type}_{hex(digest_value)}` under `root`.
///
/// This is the placeholder object-storage backend; swapping to S3 /
/// GCS is a matter of replacing this type.
#[derive(Debug, Clone)]
pub struct ContentFilestore {
    root: PathBuf,
}

impl ContentFilestore {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// Write `body` to the store under the digest's key. Overwrites any
    /// existing file — re-uploading the same body is a no-op.
    pub async fn write_blob(
        &self,
        digest: &ContentDigest,
        body: &[u8],
    ) -> io::Result<()> {
        fs::create_dir_all(&self.root).await?;

        let path = self.root.join(Self::blob_filename(digest));

        let mut file = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&path)
            .await?;
        file.write_all(body).await?;
        file.flush().await?;
        Ok(())
    }

    /// Read a blob body by its digest. Returns `NotFound` if no file
    /// exists for the given digest.
    pub async fn read_blob(
        &self,
        digest: &ContentDigest,
    ) -> io::Result<Vec<u8>> {
        let path = self.root.join(Self::blob_filename(digest));
        fs::read(&path).await
    }

    fn blob_filename(digest: &ContentDigest) -> String {
        format!("{}_{}", digest.r#type, util::hex::encode(&digest.value))
    }
}

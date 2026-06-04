use crate::service::proto::{Blob, ContentDigest, UploadBlobRequest};
use crate::util;
use tonic::Status;

/// Pull the blob, digest, and body out of an `UploadBlobRequest`,
/// returning `InvalidArgument` for any structural or integrity problem.
pub fn parse_upload_blob_request(
    request: UploadBlobRequest,
) -> Result<(Blob, ContentDigest, Vec<u8>), Status> {
    let UploadBlobRequest { blob, body } = request;

    let blob = blob.ok_or_else(|| {
        Status::invalid_argument("upload_blob: blob is required")
    })?;
    let digest = blob.digest.clone().ok_or_else(|| {
        Status::invalid_argument("upload_blob: blob.digest is required")
    })?;

    if blob.size as usize != body.len() {
        return Err(Status::invalid_argument(format!(
            "upload_blob: declared size {} does not match body length {}",
            blob.size,
            body.len()
        )));
    }

    util::digest::verify_content_digest(digest.r#type, &digest.value, &body)
        .map_err(|e| Status::invalid_argument(e.to_string()))?;

    Ok((blob, digest, body))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::ContentDigestType;
    use sha2::{Digest, Sha256};
    use tonic::Code;

    fn sha256(body: &[u8]) -> Vec<u8> {
        let mut h = Sha256::new();
        h.update(body);
        h.finalize().to_vec()
    }

    fn make_blob(body: &[u8], digest: Option<ContentDigest>) -> Blob {
        Blob {
            digest,
            mime_type: "application/octet-stream".into(),
            size: body.len() as i64,
        }
    }

    fn valid_digest(body: &[u8]) -> ContentDigest {
        ContentDigest {
            r#type: ContentDigestType::Sha256.into(),
            value: sha256(body),
        }
    }

    #[test]
    fn rejects_missing_blob() {
        let req = UploadBlobRequest {
            blob: None,
            body: vec![1, 2, 3],
        };
        let err = parse_upload_blob_request(req).unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(err.message().contains("blob is required"));
    }

    #[test]
    fn rejects_missing_digest() {
        let body = vec![1, 2, 3];
        let req = UploadBlobRequest {
            blob: Some(make_blob(&body, None)),
            body,
        };
        let err = parse_upload_blob_request(req).unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(err.message().contains("blob.digest is required"));
    }

    #[test]
    fn rejects_size_mismatch() {
        let body = b"hello".to_vec();
        let mut blob = make_blob(&body, Some(valid_digest(&body)));
        blob.size = 999;
        let req = UploadBlobRequest {
            blob: Some(blob),
            body,
        };
        let err = parse_upload_blob_request(req).unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(err.message().contains("does not match body length"));
    }

    #[test]
    fn rejects_digest_mismatch() {
        let body = b"hello".to_vec();
        let bad_digest = ContentDigest {
            r#type: ContentDigestType::Sha256.into(),
            value: vec![0u8; 32],
        };
        let req = UploadBlobRequest {
            blob: Some(make_blob(&body, Some(bad_digest))),
            body,
        };
        let err = parse_upload_blob_request(req).unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(err.message().contains("digest does not match"));
    }

    #[test]
    fn rejects_unsupported_digest_type() {
        let body = b"hello".to_vec();
        let bad_digest = ContentDigest {
            r#type: ContentDigestType::Unspecified.into(),
            value: sha256(&body),
        };
        let req = UploadBlobRequest {
            blob: Some(make_blob(&body, Some(bad_digest))),
            body,
        };
        let err = parse_upload_blob_request(req).unwrap_err();
        assert_eq!(err.code(), Code::InvalidArgument);
        assert!(err.message().contains("unsupported content digest type"));
    }

    #[test]
    fn accepts_valid_request() {
        let body = b"some body bytes".to_vec();
        let digest = valid_digest(&body);
        let blob = make_blob(&body, Some(digest.clone()));
        let req = UploadBlobRequest {
            blob: Some(blob.clone()),
            body: body.clone(),
        };
        let (out_blob, out_digest, out_body) =
            parse_upload_blob_request(req).unwrap();
        assert_eq!(out_blob, blob);
        assert_eq!(out_digest, digest);
        assert_eq!(out_body, body);
    }
}

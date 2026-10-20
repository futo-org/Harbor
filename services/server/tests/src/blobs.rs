//! Tests for the content service (`UploadBlob`) and the `/blob/{digest_id}`
//! HTTP route that serves uploaded bodies.

use crate::*;

/// A fresh blob with a random body, so each test uploads a new digest.
fn random_blob() -> (Blob, Vec<u8>) {
    let body = format!("blob-{}", random_string()).into_bytes();
    let digest = ContentDigest {
        r#type: ContentDigestType::Sha256 as i32,
        value: sha256(&body),
    };
    let blob = Blob {
        digest: Some(digest),
        mime_type: "text/plain".to_owned(),
        size: body.len() as i64,
    };
    (blob, body)
}

fn blob_url(digest: &ContentDigest) -> String {
    format!("{}/blob/{}", grpc_addr(), digest.to_id())
}

async fn upload(blob: &Blob, body: &[u8]) -> Result<(), tonic::Status> {
    content_service()
        .await
        .upload_blob(UploadBlobRequest {
            blob: Some(blob.clone()),
            body: body.to_vec(),
        })
        .await
        .map(drop)
}

#[tokio::test]
async fn upload_blob_is_served_by_blob_route() {
    let (blob, body) = random_blob();
    upload(&blob, &body).await.expect("upload_blob failed");

    let response = reqwest::get(blob_url(blob.digest.as_ref().unwrap()))
        .await
        .expect("GET /blob failed");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    assert_eq!(content_type.as_deref(), Some("text/plain"));
    let got = response.bytes().await.expect("failed to read body");
    assert_eq!(got.as_ref(), body.as_slice());
}

#[tokio::test]
async fn upload_blob_twice_is_idempotent() {
    let (blob, body) = random_blob();
    upload(&blob, &body)
        .await
        .expect("first upload_blob failed");
    upload(&blob, &body)
        .await
        .expect("second upload_blob failed");

    let response = reqwest::get(blob_url(blob.digest.as_ref().unwrap()))
        .await
        .expect("GET /blob failed");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let got = response.bytes().await.expect("failed to read body");
    assert_eq!(got.as_ref(), body.as_slice());
}

#[tokio::test]
async fn upload_blob_rejects_mismatched_digest() {
    let (blob, _) = random_blob();
    let (_, other_body) = random_blob();

    let err = upload(&blob, &other_body).await.expect_err(
        "upload_blob accepted a body that does not match its digest",
    );
    assert_eq!(err.code(), tonic::Code::InvalidArgument);

    let response = reqwest::get(blob_url(blob.digest.as_ref().unwrap()))
        .await
        .expect("GET /blob failed");
    assert_eq!(response.status(), reqwest::StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn upload_blob_rejects_size_mismatch() {
    let (mut blob, body) = random_blob();
    blob.size += 1;

    let err = upload(&blob, &body).await.expect_err(
        "upload_blob accepted a blob whose size does not match its body",
    );
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
}

#[tokio::test]
async fn unknown_blob_is_not_found() {
    let (blob, _) = random_blob();

    let response = reqwest::get(blob_url(blob.digest.as_ref().unwrap()))
        .await
        .expect("GET /blob failed");
    assert_eq!(response.status(), reqwest::StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn malformed_blob_id_is_bad_request() {
    let response = reqwest::get(format!("{}/blob/not-a-digest", grpc_addr()))
        .await
        .expect("GET /blob failed");
    assert_eq!(response.status(), reqwest::StatusCode::BAD_REQUEST);
}

//! Tests for the content service (`UploadBlob`) and the `/blob/{digest_id}`
//! HTTP route that serves uploaded bodies.

use crate::*;

/// A fresh blob with a random body, so each test uploads a new digest.
fn random_blob() -> (Blob, Vec<u8>) {
    let body = format!("blob-{}", random_string()).into_bytes();
    let digest = content_digest(&body);
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
    assert_eq!(
        err.message(),
        "upload_blob: declared size 26 does not match body length 25"
    );
}

#[tokio::test]
async fn upload_blob_validation_blob_too_large() {
    let (mut blob, body) = random_blob();
    blob.size += (100 * 1024 * 1024) + 1;

    let err = upload(&blob, &body).await.unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert_eq!(
        err.message(),
        "upload_blob: blob is invalid: size is too large (104857626), maximum is 104857600"
    );
}

#[tokio::test]
async fn upload_blob_validation_blob_digest_missing() {
    let (mut blob, body) = random_blob();
    blob.digest = None;

    let err = upload(&blob, &body).await.unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert_eq!(
        err.message(),
        "upload_blob: blob is invalid: digest is missing",
    );
}

#[tokio::test]
async fn upload_blob_validation_blob_digest_invalid() {
    let (mut blob, body) = random_blob();
    blob.digest.as_mut().unwrap().r#type = 999;

    let err = upload(&blob, &body).await.unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert_eq!(
        err.message(),
        "upload_blob: blob is invalid: digest type is invalid",
    );
}

#[tokio::test]
async fn upload_blob_validation_blob_mime_type_too_large() {
    let (mut blob, body) = random_blob();
    blob.mime_type = "m".repeat(51);

    let err = upload(&blob, &body).await.unwrap_err();
    assert_eq!(err.code(), tonic::Code::InvalidArgument);
    assert_eq!(
        err.message(),
        "upload_blob: blob is invalid: mime type is too long (51), maximum is 50",
    );
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

const PROFILE_NAME: &str = "blob uploader";

#[tokio::test]
async fn profile_update_avatar() {
    let (avatar_image, avatar) = avatar();
    let avatar_blob = avatar_image.blob.clone().unwrap();

    let mut client = TestClient::new().await;
    let profile_update = ProfileUpdate {
        name: Some(PROFILE_NAME.to_owned()),
        avatar: Some(ImageSet {
            images: vec![avatar_image],
        }),
        banner: None,
        description: None,
        alias: None,
    };
    client.profile_update(profile_update, current_timestamp());
    client.submit_events().await;

    test_blob_upload(&avatar_blob, avatar).await;
}

#[tokio::test]
async fn profile_update_banner() {
    let (banner_image, banner) = banner();
    let banner_blob = banner_image.blob.clone().unwrap();

    let mut client = TestClient::new().await;
    let profile_update = ProfileUpdate {
        name: Some(PROFILE_NAME.to_owned()),
        avatar: None,
        banner: Some(ImageSet {
            images: vec![banner_image],
        }),
        description: None,
        alias: None,
    };
    client.profile_update(profile_update, current_timestamp());
    client.submit_events().await;

    test_blob_upload(&banner_blob, banner).await;
}

#[tokio::test]
async fn profile_update_avatar_and_banner() {
    let (avatar_image, avatar) = avatar();
    let avatar_blob = avatar_image.blob.clone().unwrap();
    let (banner_image, banner) = banner();
    let banner_blob = banner_image.blob.clone().unwrap();

    let mut client = TestClient::new().await;
    let profile_update = ProfileUpdate {
        name: Some(PROFILE_NAME.to_owned()),
        avatar: Some(ImageSet {
            images: vec![avatar_image],
        }),
        banner: Some(ImageSet {
            images: vec![banner_image],
        }),
        description: None,
        alias: None,
    };
    client.profile_update(profile_update, current_timestamp());
    client.submit_events().await;

    test_blob_upload(&avatar_blob, avatar).await;
    test_blob_upload(&banner_blob, banner).await;
}

#[tokio::test]
async fn post_with_one_image() {
    let (post_image, post_image_bytes) = post0();
    let post_image_blob = post_image.blob.clone().unwrap();

    let mut client = TestClient::new().await;
    let post = Post {
        text: "Hello, World!".to_owned(),
        images: vec![ImageSet {
            images: vec![post_image],
        }],
        ..Default::default()
    };
    client.post(post, current_timestamp());
    client.submit_events().await;

    test_blob_upload(&post_image_blob, post_image_bytes).await;
}

#[tokio::test]
async fn post_with_three_images() {
    let (post_image0, post_image_bytes0) = post0();
    let post_image_blob0 = post_image0.blob.clone().unwrap();
    let (post_image1, post_image_bytes1) = post1();
    let post_image_blob1 = post_image1.blob.clone().unwrap();
    let (post_image2, post_image_bytes2) = post2();
    let post_image_blob2 = post_image2.blob.clone().unwrap();

    let mut client = TestClient::new().await;
    let post = Post {
        text: "Hello, World!".to_owned(),
        images: vec![
            ImageSet {
                images: vec![post_image0, post_image1],
            },
            ImageSet {
                images: vec![post_image2],
            },
        ],
        ..Default::default()
    };
    client.post(post, current_timestamp());
    client.submit_events().await;

    test_blob_upload(&post_image_blob0, post_image_bytes0).await;
    test_blob_upload(&post_image_blob1, post_image_bytes1).await;
    test_blob_upload(&post_image_blob2, post_image_bytes2).await;
}

#[tokio::test]
async fn verification_claim_with_one_image() {
    let (verification_image, verification_image_bytes) = verification0();
    let verification_image_blob = verification_image.blob.clone().unwrap();

    let mut client = TestClient::new().await;
    let mut claim = github_verification_claim("test");
    claim.images = vec![ImageSet {
        images: vec![verification_image],
    }];
    client.verification_claim(claim, current_timestamp());
    client.submit_events().await;

    test_blob_upload(&verification_image_blob, verification_image_bytes).await;
}

#[tokio::test]
async fn verification_claim_with_three_images() {
    let (verification_image0, verification_image_bytes0) = verification0();
    let verification_image_blob0 = verification_image0.blob.clone().unwrap();
    let (verification_image1, verification_image_bytes1) = verification1();
    let verification_image_blob1 = verification_image1.blob.clone().unwrap();
    let (verification_image2, verification_image_bytes2) = verification2();
    let verification_image_blob2 = verification_image2.blob.clone().unwrap();

    let mut client = TestClient::new().await;
    let mut claim = github_verification_claim("test");
    claim.images = vec![
        ImageSet {
            images: vec![verification_image0, verification_image1],
        },
        ImageSet {
            images: vec![verification_image2],
        },
    ];
    client.verification_claim(claim, current_timestamp());
    client.submit_events().await;

    test_blob_upload(&verification_image_blob0, verification_image_bytes0)
        .await;
    test_blob_upload(&verification_image_blob1, verification_image_bytes1)
        .await;
    test_blob_upload(&verification_image_blob2, verification_image_bytes2)
        .await;
}

macro_rules! image_fn {
    ( $( $name: ident . $ext: ident: $width: expr, $height: expr $(;)* )+ ) => {
        $(
        fn $name() -> (Image, &'static [u8]) {
            const BYTES: &[u8] = include_bytes!(concat!("../images/", stringify!($name), ".", stringify!($ext)));
            let image = Image {
                blob: Some(Blob {
                    digest: Some(content_digest(BYTES)),
                    mime_type: image_fn!(_mime_type $ext).to_owned(),
                    size: BYTES.len() as _,
                }),
                width: $width,
                height: $height,
            };
            (image, BYTES)
        }
        )+
    };
    (_mime_type png) => { "image/png" };
    (_mime_type jpg) => { "image/jpeg" };
    (_mime_type svg) => { "image/svg+xml" };
}

image_fn!(
    avatar.jpg: 256, 256;
    banner.svg: 2048, 2048;
    post0.png: 512, 512;
    post1.png: 512, 512;
    post2.png: 512, 512;
    verification0.png: 1152, 1152;
    verification1.png: 512, 512;
    verification2.png: 512, 512;
);

async fn test_blob_upload(blob: &Blob, bytes: &[u8]) {
    upload(blob, bytes).await.expect("failed to upload blob");

    let response = reqwest::get(blob_url(blob.digest.as_ref().unwrap()))
        .await
        .expect("GET /blob failed");
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    let got = response.bytes().await.expect("failed to read blob");
    assert_eq!(got.as_ref(), bytes);
}

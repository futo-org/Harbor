//! Tower middleware enforcing the `polycentric-content-digest` header:
//! when a request carries one, it must match the digest of the message
//! bytes actually received, or the request is rejected. Requests without
//! the header pass through untouched.
//!
//! This is what lets `http_sig::verify_signed_request` trust the digest
//! header for body binding: the signature covers the header, and this
//! layer proves the header matches the body. Any service authenticating
//! with `http_sig` MUST sit behind this layer.
//!
//! Place INSIDE any grpc-web translation layer (`grpc_web.layer(
//! ContentDigestLayer.layer(svc))`) so the framing seen here is
//! canonical gRPC on both the native and web paths.

use http_body_util::{BodyExt as _, Full, LengthLimitError, Limited};
use polycentric_common::http_sig::{META_CONTENT_DIGEST, content_digest};
use std::convert::Infallible;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use tonic::body::Body;
use tonic::server::NamedService;

/// Largest request body the middleware will buffer. Signed requests are
/// tiny; anything larger is refused before hashing (DoS guard).
const MAX_BODY_BYTES: usize = 64 * 1024;

/// Wraps a gRPC service in [`ContentDigestService`].
#[derive(Clone, Copy, Default)]
pub struct ContentDigestLayer;

impl<S> tower_layer::Layer<S> for ContentDigestLayer {
    type Service = ContentDigestService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        ContentDigestService { inner }
    }
}

#[derive(Clone)]
pub struct ContentDigestService<S> {
    inner: S,
}

impl<S> tower::Service<http::Request<Body>> for ContentDigestService<S>
where
    S: tower::Service<
            http::Request<Body>,
            Response = http::Response<Body>,
            Error = Infallible,
        > + Clone
        + Send
        + 'static,
    S::Future: Send + 'static,
{
    type Response = http::Response<Body>;
    type Error = Infallible;
    type Future = Pin<
        Box<dyn Future<Output = Result<Self::Response, Infallible>> + Send>,
    >;

    fn poll_ready(
        &mut self,
        cx: &mut Context<'_>,
    ) -> Poll<Result<(), Infallible>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: http::Request<Body>) -> Self::Future {
        // Standard tower pattern: take the service that was polled ready
        // and leave a fresh clone behind for the next call.
        let clone = self.inner.clone();
        let mut inner = std::mem::replace(&mut self.inner, clone);

        Box::pin(async move {
            let (parts, body) = req.into_parts();

            let claimed = parts
                .headers
                .get(META_CONTENT_DIGEST)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned);

            let bytes = match Limited::new(body, MAX_BODY_BYTES).collect().await
            {
                Ok(collected) => collected.to_bytes(),
                // The body is already partially consumed, so refuse
                // rather than forward something corrupt. Distinguish the
                // size cap from other read failures (transport resets,
                // grpc-web decode errors) so neither is mislabeled.
                Err(err) => {
                    return Ok(
                        if err.downcast_ref::<LengthLimitError>().is_some() {
                            grpc_error(
                                tonic::Code::ResourceExhausted,
                                "request body too large",
                            )
                        } else {
                            grpc_error(
                                tonic::Code::Internal,
                                "failed to read request body",
                            )
                        },
                    );
                }
            };

            // A claimed digest must match the received message bytes.
            // Compressed or malformed framing has no verifiable message,
            // so a claim over it is also rejected.
            if let Some(claimed) = claimed {
                let matches = unary_frame_message(&bytes)
                    .is_some_and(|message| content_digest(message) == claimed);
                if !matches {
                    return Ok(grpc_error(
                        tonic::Code::Unauthenticated,
                        "content digest does not match request body",
                    ));
                }
            }

            let req =
                http::Request::from_parts(parts, Body::new(Full::new(bytes)));
            inner.call(req).await
        })
    }
}

impl<S: NamedService> NamedService for ContentDigestService<S> {
    const NAME: &'static str = S::NAME;
}

/// gRPC unary framing: `[compressed: 1][length: 4 BE][message]`. Returns
/// the message bytes when the body is exactly one uncompressed frame.
fn unary_frame_message(framed: &[u8]) -> Option<&[u8]> {
    if framed.len() < 5 || framed[0] != 0 {
        return None;
    }
    let len = u32::from_be_bytes(framed[1..5].try_into().ok()?) as usize;
    let message = &framed[5..];
    (message.len() == len).then_some(message)
}

/// A trailers-only gRPC error response (carried on HTTP 200, as gRPC
/// expects).
fn grpc_error(code: tonic::Code, message: &str) -> http::Response<Body> {
    let mut response = http::Response::new(Body::empty());
    response.headers_mut().insert(
        http::header::CONTENT_TYPE,
        http::HeaderValue::from_static("application/grpc"),
    );
    response
        .headers_mut()
        .insert("grpc-status", http::HeaderValue::from(code as i32));
    if let Ok(value) = http::HeaderValue::from_str(message) {
        response.headers_mut().insert("grpc-message", value);
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use prost::Message as _;
    use std::sync::{Arc, Mutex};

    /// Inner service that records whether it was reached.
    #[derive(Clone, Default)]
    struct Probe {
        reached: Arc<Mutex<bool>>,
    }

    impl tower::Service<http::Request<Body>> for Probe {
        type Response = http::Response<Body>;
        type Error = Infallible;
        type Future = std::future::Ready<Result<Self::Response, Infallible>>;

        fn poll_ready(
            &mut self,
            _cx: &mut Context<'_>,
        ) -> Poll<Result<(), Infallible>> {
            Poll::Ready(Ok(()))
        }

        fn call(&mut self, _req: http::Request<Body>) -> Self::Future {
            *self.reached.lock().unwrap() = true;
            std::future::ready(Ok(http::Response::new(Body::empty())))
        }
    }

    fn grpc_frame(message: &[u8]) -> Vec<u8> {
        let mut framed = vec![0u8];
        framed.extend_from_slice(&(message.len() as u32).to_be_bytes());
        framed.extend_from_slice(message);
        framed
    }

    /// Push a request through the middleware; returns whether the inner
    /// service was reached and the response's grpc-status header if any.
    async fn run(
        body: Vec<u8>,
        digest_header: Option<String>,
    ) -> (bool, Option<String>) {
        let probe = Probe::default();
        let reached = probe.reached.clone();
        let mut svc = ContentDigestService { inner: probe };
        std::future::poll_fn(|cx| tower::Service::poll_ready(&mut svc, cx))
            .await
            .unwrap();

        let mut req =
            http::Request::new(Body::new(Full::new(bytes::Bytes::from(body))));
        if let Some(digest) = digest_header {
            req.headers_mut().insert(
                META_CONTENT_DIGEST,
                http::HeaderValue::from_str(&digest).unwrap(),
            );
        }
        let response = tower::Service::call(&mut svc, req).await.unwrap();
        let status = response
            .headers()
            .get("grpc-status")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let reached = *reached.lock().unwrap();
        (reached, status)
    }

    #[tokio::test]
    async fn matching_digest_passes_through() {
        // The wire contract the whole scheme rests on: the client digests
        // `encode_to_vec()`, and the frame payload IS those bytes.
        let message = crate::service::proto::SetBanStatusRequest {
            target_identity: "abc123".to_string(),
            banned: true,
        }
        .encode_to_vec();

        let (reached, status) =
            run(grpc_frame(&message), Some(content_digest(&message))).await;
        assert!(reached);
        assert_eq!(status, None);
    }

    #[tokio::test]
    async fn mismatched_digest_is_rejected() {
        let message = b"payload".to_vec();
        let (reached, status) =
            run(grpc_frame(&message), Some(content_digest(b"other"))).await;
        assert!(!reached);
        assert_eq!(status.as_deref(), Some("16")); // UNAUTHENTICATED
    }

    #[tokio::test]
    async fn claimed_digest_over_unverifiable_framing_is_rejected() {
        let message = b"payload".to_vec();
        let digest = content_digest(&message);

        // Compressed flag set: the message can't be verified.
        let mut framed = grpc_frame(&message);
        framed[0] = 1;
        let (reached, status) = run(framed, Some(digest.clone())).await;
        assert!(!reached);
        assert_eq!(status.as_deref(), Some("16"));

        // Length prefix doesn't match the payload.
        let mut framed = grpc_frame(&message);
        framed[4] += 1;
        let (reached, status) = run(framed, Some(digest)).await;
        assert!(!reached);
        assert_eq!(status.as_deref(), Some("16"));
    }

    #[tokio::test]
    async fn requests_without_the_header_pass_through() {
        let (reached, status) = run(grpc_frame(b"anything"), None).await;
        assert!(reached);
        assert_eq!(status, None);

        // Even with framing the layer can't parse.
        let (reached, status) = run(vec![1, 2, 3], None).await;
        assert!(reached);
        assert_eq!(status, None);
    }
}

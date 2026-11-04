//! Plain HTTP GETs: blob downloads and alias lookups. Everything else goes
//! over gRPC.

use std::time::Duration;

use crate::sdk::error::{SdkError, SdkResult};

/// How long a GET may take before it's abandoned.
pub const TIMEOUT: Duration = Duration::from_secs(10);

/// GET `url`. Returns the body for a 2xx response and `None` otherwise.
#[cfg(not(target_arch = "wasm32"))]
pub async fn get(url: &str, accept: Option<&str>) -> SdkResult<Option<Vec<u8>>> {
    use http_body_util::{BodyExt, Empty};
    use hyper::body::Bytes;
    use hyper_util::client::legacy::Client;
    use hyper_util::rt::TokioExecutor;
    use std::sync::OnceLock;

    type HttpsClient = Client<
        hyper_rustls::HttpsConnector<hyper_util::client::legacy::connect::HttpConnector>,
        Empty<Bytes>,
    >;
    static CLIENT: OnceLock<HttpsClient> = OnceLock::new();
    let client = CLIENT.get_or_init(|| {
        let connector = hyper_rustls::HttpsConnectorBuilder::new()
            .with_webpki_roots()
            .https_or_http()
            .enable_http1()
            .build();
        Client::builder(TokioExecutor::new()).build(connector)
    });

    let mut request = hyper::Request::get(url);
    if let Some(accept) = accept {
        request = request.header(hyper::header::ACCEPT, accept);
    }
    let request = request
        .body(Empty::new())
        .map_err(|e| SdkError::InvalidInput(format!("bad url {url}: {e}")))?;

    let url = url.to_string();
    let fetch = async move {
        let response = client
            .request(request)
            .await
            .map_err(|e| SdkError::Network(format!("GET {url}: {e}")))?;
        if !response.status().is_success() {
            return Ok(None);
        }
        let body = response
            .into_body()
            .collect()
            .await
            .map_err(|e| SdkError::Network(format!("GET {url}: {e}")))?;
        Ok(Some(body.to_bytes().to_vec()))
    };

    with_runtime(async move {
        match tokio::time::timeout(TIMEOUT, fetch).await {
            Ok(result) => result,
            Err(_) => Err(SdkError::Network("GET timed out".into())),
        }
    })
    .await
}

/// Run `fut` on a tokio runtime even when the caller isn't on one (hyper's
/// connector needs tokio's reactor).
#[cfg(not(target_arch = "wasm32"))]
async fn with_runtime<T: Send + 'static>(
    fut: impl std::future::Future<Output = SdkResult<T>> + Send + 'static,
) -> SdkResult<T> {
    if tokio::runtime::Handle::try_current().is_ok() {
        return fut.await;
    }
    let (tx, rx) = futures::channel::oneshot::channel();
    let spawned = crate::query::client::spawn(async move {
        let _ = tx.send(fut.await);
    });
    if !spawned {
        return Err(SdkError::Network("no async runtime".into()));
    }
    rx.await
        .map_err(|_| SdkError::Network("request cancelled".into()))?
}

/// GET `url`. Returns the body for a 2xx response and `None` otherwise.
#[cfg(target_arch = "wasm32")]
pub async fn get(url: &str, accept: Option<&str>) -> SdkResult<Option<Vec<u8>>> {
    use wasm_bindgen::JsCast;
    use wasm_bindgen_futures::JsFuture;

    let init = web_sys::RequestInit::new();
    let headers = web_sys::Headers::new().map_err(|e| SdkError::Network(format!("{e:?}")))?;
    if let Some(accept) = accept {
        headers
            .set("accept", accept)
            .map_err(|e| SdkError::Network(format!("{e:?}")))?;
    }
    init.set_headers(&headers);
    let request = web_sys::Request::new_with_str_and_init(url, &init)
        .map_err(|e| SdkError::InvalidInput(format!("bad url {url}: {e:?}")))?;

    // `fetch` exists on both windows and workers; call it off the global.
    let global = js_sys::global();
    let fetch = js_sys::Reflect::get(&global, &"fetch".into())
        .ok()
        .and_then(|f| f.dyn_into::<js_sys::Function>().ok())
        .ok_or_else(|| SdkError::Network("fetch is unavailable".into()))?;
    let promise: js_sys::Promise = fetch
        .call1(&global, &request)
        .map_err(|e| SdkError::Network(format!("GET {url}: {e:?}")))?
        .unchecked_into();

    let timeout = futures_timer::Delay::new(TIMEOUT);
    let response = match futures::future::select(JsFuture::from(promise), timeout).await {
        futures::future::Either::Left((result, _)) => {
            result.map_err(|e| SdkError::Network(format!("GET {url}: {e:?}")))?
        }
        futures::future::Either::Right(_) => {
            return Err(SdkError::Network(format!("GET {url}: timed out")));
        }
    };
    let response: web_sys::Response = response.unchecked_into();
    if !response.ok() {
        return Ok(None);
    }
    let buffer = JsFuture::from(
        response
            .array_buffer()
            .map_err(|e| SdkError::Network(format!("{e:?}")))?,
    )
    .await
    .map_err(|e| SdkError::Network(format!("GET {url}: {e:?}")))?;
    Ok(Some(js_sys::Uint8Array::new(&buffer).to_vec()))
}

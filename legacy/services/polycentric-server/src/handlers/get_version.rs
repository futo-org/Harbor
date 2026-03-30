use ::warp::Reply;

pub(crate) async fn handler() -> ::warp::reply::Response {
    ::warp::reply::json(&::serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
    }))
    .into_response()
}

//! Stamps the verified identity onto OTLP/JSON payloads and forwards them.

use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::auth::AuthenticatedIdentity;

pub const ATTR_IDENTITY: &str = "harbor.auth.identity";
pub const ATTR_SIGNING_KEY: &str = "harbor.auth.signing_key";

/// Replaces any client-supplied auth attributes on every resource in the
/// payload with the identity we verified, so downstream can trust them.
pub fn stamp(payload: &mut Value, resource_key: &str, identity: &AuthenticatedIdentity) {
    let Some(resources) = payload.get_mut(resource_key).and_then(Value::as_array_mut) else {
        return;
    };
    for entry in resources {
        let Some(attributes) = resource_attributes(entry) else {
            continue;
        };
        attributes.retain(|attribute| {
            !matches!(
                attribute.get("key").and_then(Value::as_str),
                Some(ATTR_IDENTITY | ATTR_SIGNING_KEY)
            )
        });
        attributes
            .push(json!({ "key": ATTR_IDENTITY, "value": { "stringValue": identity.identity } }));
        attributes.push(
            json!({ "key": ATTR_SIGNING_KEY, "value": { "stringValue": identity.signing_key } }),
        );
    }
}

/// The resource attribute list of one `resourceLogs`/`resourceSpans` entry,
/// created when absent (the identity has to go somewhere). `None` when the
/// entry is not shaped like OTLP at all.
fn resource_attributes(entry: &mut Value) -> Option<&mut Vec<Value>> {
    entry
        .as_object_mut()?
        .entry("resource")
        .or_insert_with(|| json!({}))
        .as_object_mut()?
        .entry("attributes")
        .or_insert_with(|| json!([]))
        .as_array_mut()
}

/// POSTs `payload` as JSON to `url` with `headers`, mapping upstream
/// failures to 502.
pub async fn forward(
    client: &reqwest::Client,
    url: &str,
    payload: &Value,
    headers: &[(&str, &str)],
) -> StatusCode {
    let body = match serde_json::to_vec(payload) {
        Ok(body) => body,
        Err(e) => {
            tracing::error!(error = %e, "serialize payload");
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    };
    let mut request = client
        .post(url)
        .header(http::header::CONTENT_TYPE, "application/json");
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    match request.body(body).send().await {
        Ok(response) if response.status().is_success() => StatusCode::OK,
        Ok(response) => {
            tracing::warn!(url, status = %response.status(), "upstream rejected payload");
            StatusCode::BAD_GATEWAY
        }
        Err(e) => {
            tracing::warn!(url, error = %e, "upstream unreachable");
            StatusCode::BAD_GATEWAY
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity() -> AuthenticatedIdentity {
        AuthenticatedIdentity {
            identity: "id1".to_string(),
            signing_key: "aa".to_string(),
        }
    }

    fn attributes(payload: &Value, resource_key: &str, index: usize) -> Vec<(String, String)> {
        payload[resource_key][index]["resource"]["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| {
                (
                    a["key"].as_str().unwrap().to_string(),
                    a["value"]["stringValue"].as_str().unwrap().to_string(),
                )
            })
            .collect()
    }

    #[test]
    fn appends_identity_to_existing_attributes() {
        let mut payload = json!({ "resourceSpans": [{ "resource": { "attributes": [
            { "key": "service.name", "value": { "stringValue": "harbor" } }
        ]}}]});
        stamp(&mut payload, "resourceSpans", &identity());
        assert_eq!(
            attributes(&payload, "resourceSpans", 0),
            vec![
                ("service.name".into(), "harbor".into()),
                (ATTR_IDENTITY.into(), "id1".into()),
                (ATTR_SIGNING_KEY.into(), "aa".into()),
            ]
        );
    }

    #[test]
    fn replaces_client_supplied_auth_attributes() {
        let mut payload = json!({ "resourceLogs": [{ "resource": { "attributes": [
            { "key": ATTR_SIGNING_KEY, "value": { "stringValue": "spoofed" } },
            { "key": ATTR_IDENTITY, "value": { "stringValue": "spoofed" } },
            { "key": "os.name", "value": { "stringValue": "ios" } }
        ]}}]});
        stamp(&mut payload, "resourceLogs", &identity());
        assert_eq!(
            attributes(&payload, "resourceLogs", 0),
            vec![
                ("os.name".into(), "ios".into()),
                (ATTR_IDENTITY.into(), "id1".into()),
                (ATTR_SIGNING_KEY.into(), "aa".into()),
            ]
        );
    }

    #[test]
    fn creates_the_resource_when_missing() {
        let mut payload = json!({ "resourceSpans": [{ "scopeSpans": [] }, { "resource": {} }] });
        stamp(&mut payload, "resourceSpans", &identity());
        for index in 0..2 {
            assert_eq!(
                attributes(&payload, "resourceSpans", index),
                vec![
                    (ATTR_IDENTITY.into(), "id1".into()),
                    (ATTR_SIGNING_KEY.into(), "aa".into()),
                ]
            );
        }
    }

    #[test]
    fn leaves_other_shapes_alone() {
        let original = json!({ "resourceLogs": "nope", "other": [1, 2] });
        let mut payload = original.clone();
        stamp(&mut payload, "resourceLogs", &identity());
        stamp(&mut payload, "resourceSpans", &identity());
        assert_eq!(payload, original);
    }

    #[tokio::test]
    async fn forwards_json_and_maps_upstream_status() {
        let mut upstream = mockito::Server::new_async().await;
        let ok = upstream
            .mock("POST", "/ok")
            .match_header("content-type", "application/json")
            .match_body(r#"{"a":1}"#)
            .with_status(204)
            .create_async()
            .await;
        let failing = upstream
            .mock("POST", "/fail")
            .with_status(500)
            .create_async()
            .await;
        let client = reqwest::Client::new();
        let payload = json!({ "a": 1 });

        assert_eq!(
            forward(&client, &format!("{}/ok", upstream.url()), &payload, &[]).await,
            StatusCode::OK
        );
        assert_eq!(
            forward(&client, &format!("{}/fail", upstream.url()), &payload, &[]).await,
            StatusCode::BAD_GATEWAY
        );
        ok.assert_async().await;
        failing.assert_async().await;
    }

    #[tokio::test]
    async fn unreachable_upstream_is_a_bad_gateway() {
        let client = reqwest::Client::new();
        assert_eq!(
            forward(&client, "http://127.0.0.1:1/v1/traces", &json!({}), &[]).await,
            StatusCode::BAD_GATEWAY
        );
    }
}

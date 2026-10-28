//! Stamps the verified identity onto OTLP payloads and forwards them as
//! protobuf, the only encoding VictoriaLogs accepts.

use axum::http::StatusCode;
use opentelemetry_proto::tonic::common::v1::{AnyValue, KeyValue, any_value::Value};
use opentelemetry_proto::tonic::resource::v1::Resource;

use crate::auth::AuthenticatedIdentity;

pub const ATTR_IDENTITY: &str = "harbor.auth.identity";
pub const ATTR_SIGNING_KEY: &str = "harbor.auth.signing_key";

/// Replaces any client-supplied auth attributes on every resource with the
/// identity we verified, so downstream can trust them. A missing resource
/// is created: the identity has to go somewhere.
pub fn stamp<'a>(
    resources: impl IntoIterator<Item = &'a mut Option<Resource>>,
    identity: &AuthenticatedIdentity,
) {
    for resource in resources {
        let attributes = &mut resource.get_or_insert_default().attributes;
        attributes.retain(|attribute| {
            !matches!(attribute.key.as_str(), ATTR_IDENTITY | ATTR_SIGNING_KEY)
        });
        attributes.push(string_attribute(ATTR_IDENTITY, &identity.identity));
        attributes.push(string_attribute(ATTR_SIGNING_KEY, &identity.signing_key));
    }
}

pub fn string_value<'a>(attributes: &'a [KeyValue], key: &str) -> Option<&'a str> {
    let attribute = attributes.iter().find(|attribute| attribute.key == key)?;
    match attribute.value.as_ref()?.value.as_ref()? {
        Value::StringValue(s) => Some(s.as_str()),
        _ => None,
    }
}

pub fn string_attribute(key: &str, value: &str) -> KeyValue {
    KeyValue {
        key: key.to_string(),
        value: Some(AnyValue {
            value: Some(Value::StringValue(value.to_string())),
        }),
        ..Default::default()
    }
}

/// POSTs protobuf `body` to `url` with `headers`, mapping upstream failures
/// to 502.
pub async fn forward(
    client: &reqwest::Client,
    url: &str,
    body: Vec<u8>,
    headers: &[(&str, &str)],
) -> StatusCode {
    let mut request = client
        .post(url)
        .header(http::header::CONTENT_TYPE, "application/x-protobuf");
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    match request.body(body).send().await {
        Ok(response) if response.status().is_success() => StatusCode::OK,
        Ok(response) => {
            let status = response.status();
            let reason = response.text().await.unwrap_or_default();
            let reason = reason.trim().chars().take(512).collect::<String>();
            tracing::warn!(url, %status, reason, "upstream rejected payload");
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

    fn resource(pairs: &[(&str, &str)]) -> Option<Resource> {
        Some(Resource {
            attributes: pairs
                .iter()
                .map(|(key, value)| string_attribute(key, value))
                .collect(),
            ..Default::default()
        })
    }

    fn pairs(resource: &Option<Resource>) -> Vec<(String, String)> {
        let attributes = &resource.as_ref().unwrap().attributes;
        attributes
            .iter()
            .map(|attribute| {
                let value = string_value(attributes, &attribute.key).unwrap();
                (attribute.key.clone(), value.to_string())
            })
            .collect()
    }

    #[test]
    fn appends_identity_to_existing_attributes() {
        let mut entry = resource(&[("service.name", "harbor")]);
        stamp([&mut entry], &identity());
        assert_eq!(
            pairs(&entry),
            vec![
                ("service.name".into(), "harbor".into()),
                (ATTR_IDENTITY.into(), "id1".into()),
                (ATTR_SIGNING_KEY.into(), "aa".into()),
            ]
        );
    }

    #[test]
    fn replaces_client_supplied_auth_attributes() {
        let mut entry = resource(&[
            (ATTR_SIGNING_KEY, "spoofed"),
            (ATTR_IDENTITY, "spoofed"),
            ("os.name", "ios"),
        ]);
        stamp([&mut entry], &identity());
        assert_eq!(
            pairs(&entry),
            vec![
                ("os.name".into(), "ios".into()),
                (ATTR_IDENTITY.into(), "id1".into()),
                (ATTR_SIGNING_KEY.into(), "aa".into()),
            ]
        );
    }

    #[test]
    fn creates_the_resource_when_missing() {
        let mut first = None;
        let mut second = Some(Resource::default());
        stamp([&mut first, &mut second], &identity());
        for entry in [&first, &second] {
            assert_eq!(
                pairs(entry),
                vec![
                    (ATTR_IDENTITY.into(), "id1".into()),
                    (ATTR_SIGNING_KEY.into(), "aa".into()),
                ]
            );
        }
    }

    #[tokio::test]
    async fn forwards_protobuf_and_maps_upstream_status() {
        let mut upstream = mockito::Server::new_async().await;
        let ok = upstream
            .mock("POST", "/ok")
            .match_header("content-type", "application/x-protobuf")
            .match_header("x-extra", "1")
            .match_body(vec![1u8, 2, 3])
            .with_status(204)
            .create_async()
            .await;
        let failing = upstream
            .mock("POST", "/fail")
            .with_status(500)
            .create_async()
            .await;
        let client = reqwest::Client::new();

        assert_eq!(
            forward(
                &client,
                &format!("{}/ok", upstream.url()),
                vec![1, 2, 3],
                &[("x-extra", "1")]
            )
            .await,
            StatusCode::OK
        );
        assert_eq!(
            forward(&client, &format!("{}/fail", upstream.url()), vec![], &[]).await,
            StatusCode::BAD_GATEWAY
        );
        ok.assert_async().await;
        failing.assert_async().await;
    }

    #[tokio::test]
    async fn unreachable_upstream_is_a_bad_gateway() {
        let client = reqwest::Client::new();
        assert_eq!(
            forward(&client, "http://127.0.0.1:1/v1/logs", vec![], &[]).await,
            StatusCode::BAD_GATEWAY
        );
    }
}

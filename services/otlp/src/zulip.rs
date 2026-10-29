//! Relays user feedback spans to Zulip, one topic per feedback.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use opentelemetry_proto::tonic::collector::trace::v1::ExportTraceServiceRequest;
use opentelemetry_proto::tonic::common::v1::KeyValue;
use opentelemetry_proto::tonic::trace::v1::Span;

use crate::config::{Config, Grafana, Zulip};
use crate::forward::{ATTR_IDENTITY, string_value};

pub const FEEDBACK_SPAN: &str = "app.feedback";

/// Zulip caps topic names at this many characters.
const MAX_TOPIC_CHARS: usize = 60;
/// Characters of the feedback kept in the topic before it is cut with an
/// ellipsis, leaving room for the trace id suffix within the cap.
const TOPIC_EXCERPT_CHARS: usize = 46;

/// A message opening its own topic in the channel.
#[derive(Debug, PartialEq)]
pub struct Message {
    pub topic: String,
    pub content: String,
}

/// One message per `app.feedback` span in the request.
pub fn feedback_messages(request: &ExportTraceServiceRequest, config: &Config) -> Vec<Message> {
    let mut messages = Vec::new();
    for entry in &request.resource_spans {
        let resource = entry
            .resource
            .as_ref()
            .map(|resource| resource.attributes.as_slice())
            .unwrap_or_default();
        for scope in &entry.scope_spans {
            for span in &scope.spans {
                if span.name == FEEDBACK_SPAN {
                    messages.push(Message {
                        topic: feedback_topic(span),
                        content: feedback_message(resource, span, config),
                    });
                }
            }
        }
    }
    messages
}

/// The start of the feedback followed by the first eight hex digits of the
/// trace id, so each feedback lands in a topic of its own that reads as the
/// feedback in the channel list.
fn feedback_topic(span: &Span) -> String {
    let message = string_value(&span.attributes, "harbor.feedback.message").unwrap_or("");
    let words: Vec<&str> = message
        .split(|c: char| c.is_whitespace() || c.is_control())
        .filter(|word| !word.is_empty())
        .collect();
    let joined = words.join(" ");
    let mut excerpt: String = joined.chars().take(TOPIC_EXCERPT_CHARS).collect();
    if excerpt.chars().count() < joined.chars().count() {
        excerpt = format!("{}…", excerpt.trim_end());
    }
    if excerpt.is_empty() {
        excerpt = "Feedback".to_string();
    }
    let topic = match span.trace_id.get(..4) {
        Some(prefix) => format!("{excerpt} · {}", hex::encode(prefix)),
        None => excerpt,
    };
    debug_assert!(topic.chars().count() <= MAX_TOPIC_CHARS);
    topic
}

fn feedback_message(resource: &[KeyValue], span: &Span, config: &Config) -> String {
    let get = |key: &str| string_value(&span.attributes, key).unwrap_or("");
    let res = |key: &str| string_value(resource, key).unwrap_or("");
    let identity = res(ATTR_IDENTITY);
    let trace_id = hex::encode(&span.trace_id);
    let build = [
        res("service.version"),
        res("deployment.environment.name"),
        res("os.name"),
        res("os.version"),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" · ");
    let email = get("harbor.feedback.email");
    let logs = span
        .events
        .iter()
        .filter(|event| event.name == "log")
        .count();

    let mut lines = vec![format!(
        "**New feedback** from {}{}",
        if identity.is_empty() {
            "`unknown`".to_string()
        } else {
            linked(
                &format!("`{identity}`"),
                config
                    .app_url
                    .as_ref()
                    .map(|app| format!("{app}/{identity}")),
            )
        },
        if build.is_empty() {
            String::new()
        } else {
            format!(" · {build}")
        }
    )];
    lines.push("```quote".to_string());
    lines.push(get("harbor.feedback.message").to_string());
    lines.push("```".to_string());
    let mut details = Vec::new();
    if !email.is_empty() {
        details.push(format!("Email: {email}"));
    }
    details.push(format!("Logs attached: {logs}"));
    details.push(format!(
        "Trace: {}",
        linked(
            &format!("`{trace_id}`"),
            config
                .grafana
                .as_ref()
                .filter(|_| !span.trace_id.is_empty())
                .map(|grafana| trace_url(grafana, &trace_id)),
        )
    ));
    lines.push(details.join(" · "));
    lines.join("\n")
}

fn linked(text: &str, url: Option<String>) -> String {
    match url {
        Some(url) => format!("[{text}]({url})"),
        None => text.to_string(),
    }
}

/// Explore, with the trace open in the VictoriaTraces datasource.
fn trace_url(grafana: &Grafana, trace_id: &str) -> String {
    let panes = serde_json::json!({
        "a": {
            "datasource": grafana.traces_datasource,
            "queries": [{
                "refId": "A",
                "datasource": { "type": "jaeger", "uid": grafana.traces_datasource },
                "query": trace_id,
            }],
        },
    });
    let query = form_urlencoded::Serializer::new(String::new())
        .append_pair("schemaVersion", "1")
        .append_pair("panes", &panes.to_string())
        .finish();
    format!("{}/explore?{query}", grafana.url)
}

/// Posts the message to its topic in the configured channel; Zulip creates
/// the topic when it is new.
pub async fn post(
    client: &reqwest::Client,
    zulip: &Zulip,
    message: &Message,
) -> Result<(), String> {
    let credentials = STANDARD.encode(format!("{}:{}", zulip.bot_email, zulip.api_key));
    let body = form_urlencoded::Serializer::new(String::new())
        .append_pair("type", "stream")
        .append_pair("to", &zulip.stream)
        .append_pair("topic", &message.topic)
        .append_pair("content", &message.content)
        .finish();
    let response = client
        .post(format!("{}/api/v1/messages", zulip.url))
        .header(http::header::AUTHORIZATION, format!("Basic {credentials}"))
        .header(
            http::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .body(body)
        .send()
        .await
        .map_err(|e| format!("zulip unreachable: {e}"))?;
    if response.status().is_success() {
        return Ok(());
    }
    let status = response.status();
    let reason = response.text().await.unwrap_or_default();
    Err(format!("zulip answered {status}: {}", reason.trim()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::forward::string_attribute;
    use opentelemetry_proto::tonic::resource::v1::Resource;
    use opentelemetry_proto::tonic::trace::v1::{ResourceSpans, ScopeSpans, span::Event};

    fn config(app_url: Option<&str>, grafana: Option<Grafana>) -> Config {
        Config {
            addr: "127.0.0.1:0".parse().unwrap(),
            allow_hosts: vec![],
            query_servers: vec![],
            victoria_logs_url: None,
            victoria_traces_url: None,
            max_body_bytes: 0,
            zulip: None,
            app_url: app_url.map(str::to_string),
            grafana,
        }
    }

    fn request(spans: Vec<Span>) -> ExportTraceServiceRequest {
        ExportTraceServiceRequest {
            resource_spans: vec![ResourceSpans {
                resource: Some(Resource {
                    attributes: vec![
                        string_attribute("service.version", "2.21.1+45"),
                        string_attribute("deployment.environment.name", "production"),
                        string_attribute("os.name", "ios"),
                        string_attribute(ATTR_IDENTITY, "abc123"),
                    ],
                    ..Default::default()
                }),
                scope_spans: vec![ScopeSpans {
                    spans,
                    ..Default::default()
                }],
                ..Default::default()
            }],
        }
    }

    #[test]
    fn formats_feedback_with_its_context() {
        let messages = feedback_messages(
            &request(vec![
                Span {
                    name: FEEDBACK_SPAN.to_string(),
                    trace_id: vec![0xab; 16],
                    attributes: vec![
                        string_attribute("harbor.feedback.message", "love it\nreally"),
                        string_attribute("harbor.feedback.email", "me@example.com"),
                    ],
                    events: vec![
                        Event {
                            name: "log".to_string(),
                            ..Default::default()
                        },
                        Event {
                            name: "log".to_string(),
                            ..Default::default()
                        },
                    ],
                    ..Default::default()
                },
                Span {
                    name: "app.error".to_string(),
                    ..Default::default()
                },
            ]),
            &config(None, None),
        );

        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].topic, "love it really · abababab");
        assert_eq!(
            messages[0].content,
            format!(
                "**New feedback** from `abc123` · 2.21.1+45 · production · ios\n```quote\nlove it\nreally\n```\nEmail: me@example.com · Logs attached: 2 · Trace: `{}`",
                "ab".repeat(16)
            )
        );
    }

    fn feedback(message: &str, trace_id: Vec<u8>) -> Span {
        Span {
            name: FEEDBACK_SPAN.to_string(),
            trace_id,
            attributes: vec![string_attribute("harbor.feedback.message", message)],
            ..Default::default()
        }
    }

    #[test]
    fn topics_are_the_feedback_cut_to_fit_zulip() {
        let long =
            "The feed keeps jumping back to the top whenever a new post arrives, very annoying";
        let topics: Vec<String> = feedback_messages(
            &request(vec![
                feedback(long, vec![0x0a, 0xf7, 0x65, 0x19, 0x16, 0xcd]),
                feedback("  tabs\tand\n\nnewlines \u{7}here ", vec![0x01; 16]),
                feedback("", vec![0x02; 16]),
                feedback("no trace", vec![]),
            ]),
            &config(None, None),
        )
        .into_iter()
        .map(|message| message.topic)
        .collect();

        assert_eq!(
            topics,
            vec![
                "The feed keeps jumping back to the top wheneve… · 0af76519",
                "tabs and newlines here · 01010101",
                "Feedback · 02020202",
                "no trace",
            ]
        );
        assert!(
            topics
                .iter()
                .all(|topic| topic.chars().count() <= MAX_TOPIC_CHARS)
        );
    }

    #[test]
    fn links_the_identity_to_its_profile_and_the_trace_to_grafana() {
        let grafana = Grafana {
            url: "https://grafana.example".to_string(),
            traces_datasource: "VictoriaTraces".to_string(),
        };
        let messages = feedback_messages(
            &request(vec![Span {
                name: FEEDBACK_SPAN.to_string(),
                trace_id: vec![0xab; 16],
                attributes: vec![string_attribute("harbor.feedback.message", "hi")],
                ..Default::default()
            }]),
            &config(Some("https://harbor.example"), Some(grafana)),
        );

        let trace_id = "ab".repeat(16);
        let panes = format!(
            "{{\"a\":{{\"datasource\":\"VictoriaTraces\",\"queries\":[{{\"datasource\":{{\"type\":\"jaeger\",\"uid\":\"VictoriaTraces\"}},\"query\":\"{trace_id}\",\"refId\":\"A\"}}]}}}}"
        );
        let panes: String = form_urlencoded::byte_serialize(panes.as_bytes()).collect();
        assert_eq!(
            messages[0].content,
            format!(
                "**New feedback** from [`abc123`](https://harbor.example/abc123) · 2.21.1+45 · production · ios\n```quote\nhi\n```\nLogs attached: 0 · Trace: [`{trace_id}`](https://grafana.example/explore?schemaVersion=1&panes={panes})"
            )
        );
    }

    #[test]
    fn feedback_without_extras_is_still_relayed() {
        let grafana = Grafana {
            url: "https://grafana.example".to_string(),
            traces_datasource: "VictoriaTraces".to_string(),
        };
        let messages = feedback_messages(
            &ExportTraceServiceRequest {
                resource_spans: vec![ResourceSpans {
                    scope_spans: vec![ScopeSpans {
                        spans: vec![Span {
                            name: FEEDBACK_SPAN.to_string(),
                            attributes: vec![string_attribute("harbor.feedback.message", "hi")],
                            ..Default::default()
                        }],
                        ..Default::default()
                    }],
                    ..Default::default()
                }],
            },
            &config(Some("https://harbor.example"), Some(grafana)),
        );
        assert_eq!(
            messages,
            vec![Message {
                topic: "hi".to_string(),
                content:
                    "**New feedback** from `unknown`\n```quote\nhi\n```\nLogs attached: 0 · Trace: ``"
                        .to_string(),
            }]
        );
    }

    #[tokio::test]
    async fn posts_with_the_bot_credentials() {
        let mut zulip_server = mockito::Server::new_async().await;
        let mock = zulip_server
            .mock("POST", "/api/v1/messages")
            .match_header("authorization", "Basic Ym90QGV4YW1wbGUuY29tOnNlY3JldA==")
            .match_header("content-type", "application/x-www-form-urlencoded")
            .match_body(
                "type=stream&to=harbor-feedback&topic=hello+%C2%B7+1234&content=hello+%26+bye",
            )
            .create_async()
            .await;
        let zulip = Zulip {
            url: zulip_server.url(),
            bot_email: "bot@example.com".to_string(),
            api_key: "secret".to_string(),
            stream: "harbor-feedback".to_string(),
        };
        let client = reqwest::Client::new();
        let message = Message {
            topic: "hello · 1234".to_string(),
            content: "hello & bye".to_string(),
        };

        assert_eq!(post(&client, &zulip, &message).await, Ok(()));
        mock.assert_async().await;

        let failing = zulip_server
            .mock("POST", "/api/v1/messages")
            .with_status(401)
            .with_body("bad key")
            .create_async()
            .await;
        assert_eq!(
            post(&client, &zulip, &message).await,
            Err("zulip answered 401 Unauthorized: bad key".to_string())
        );
        failing.assert_async().await;
    }
}

//! Mirrors the app's feedback and error report spans into VictoriaLogs as
//! log records, and the log lines a feedback span carries as events too:
//! VictoriaTraces drops a span past 1000 fields, five per event.

use opentelemetry_proto::tonic::collector::logs::v1::ExportLogsServiceRequest;
use opentelemetry_proto::tonic::collector::trace::v1::ExportTraceServiceRequest;
use opentelemetry_proto::tonic::common::v1::{AnyValue, any_value::Value};
use opentelemetry_proto::tonic::logs::v1::{LogRecord, ResourceLogs, ScopeLogs, SeverityNumber};
use opentelemetry_proto::tonic::trace::v1::Span;

use crate::forward::{string_attribute, string_value};

pub const ATTR_SPAN_NAME: &str = "span.name";
pub const FEEDBACK_SPAN: &str = "app.feedback";
pub const ERROR_SPAN: &str = "app.error";

/// One record per feedback or error span plus one per feedback log line;
/// `None` when there are none.
pub fn app_log_records(request: &ExportTraceServiceRequest) -> Option<ExportLogsServiceRequest> {
    let resource_logs: Vec<ResourceLogs> = request
        .resource_spans
        .iter()
        .filter_map(|entry| {
            let scope_logs: Vec<ScopeLogs> = entry
                .scope_spans
                .iter()
                .filter_map(|scope| {
                    let log_records: Vec<LogRecord> = scope
                        .spans
                        .iter()
                        .flat_map(|span| record(span).into_iter().chain(log_lines(span)))
                        .collect();
                    (!log_records.is_empty()).then(|| ScopeLogs {
                        scope: scope.scope.clone(),
                        log_records,
                        schema_url: scope.schema_url.clone(),
                    })
                })
                .collect();
            (!scope_logs.is_empty()).then(|| ResourceLogs {
                resource: entry.resource.clone(),
                scope_logs,
                schema_url: entry.schema_url.clone(),
            })
        })
        .collect();
    (!resource_logs.is_empty()).then_some(ExportLogsServiceRequest { resource_logs })
}

fn record(span: &Span) -> Option<LogRecord> {
    let (severity, body) = match span.name.as_str() {
        FEEDBACK_SPAN => (
            SeverityNumber::Info,
            string_value(&span.attributes, "harbor.feedback.message").unwrap_or_default(),
        ),
        ERROR_SPAN => (
            SeverityNumber::Error,
            span.status
                .as_ref()
                .map(|status| status.message.as_str())
                .filter(|message| !message.is_empty())
                .unwrap_or(&span.name),
        ),
        _ => return None,
    };
    let mut attributes = span.attributes.clone();
    attributes.push(string_attribute(ATTR_SPAN_NAME, &span.name));
    let time = if span.end_time_unix_nano > 0 {
        span.end_time_unix_nano
    } else {
        span.start_time_unix_nano
    };
    Some(LogRecord {
        time_unix_nano: time,
        observed_time_unix_nano: time,
        severity_number: severity as i32,
        severity_text: match severity {
            SeverityNumber::Error => "ERROR",
            _ => "INFO",
        }
        .to_string(),
        body: Some(AnyValue {
            value: Some(Value::StringValue(body.to_string())),
        }),
        attributes,
        trace_id: span.trace_id.clone(),
        span_id: span.span_id.clone(),
        ..Default::default()
    })
}

/// The log lines a feedback span carries as events, as records tied to it.
fn log_lines(span: &Span) -> impl Iterator<Item = LogRecord> + '_ {
    span.events
        .iter()
        .filter(move |_| span.name == FEEDBACK_SPAN)
        .map(|event| {
            let level = string_value(&event.attributes, "log.severity").unwrap_or_default();
            let message = string_value(&event.attributes, "log.message").unwrap_or_default();
            LogRecord {
                time_unix_nano: event.time_unix_nano,
                observed_time_unix_nano: event.time_unix_nano,
                severity_number: match level {
                    "debug" => SeverityNumber::Debug,
                    "info" => SeverityNumber::Info,
                    "warn" => SeverityNumber::Warn,
                    "error" => SeverityNumber::Error,
                    _ => SeverityNumber::Unspecified,
                } as i32,
                severity_text: level.to_uppercase(),
                body: Some(AnyValue {
                    value: Some(Value::StringValue(message.to_string())),
                }),
                trace_id: span.trace_id.clone(),
                span_id: span.span_id.clone(),
                ..Default::default()
            }
        })
}

/// Drops the log lines from feedback spans once they are records.
pub fn detach_log_lines(request: &mut ExportTraceServiceRequest) {
    for entry in &mut request.resource_spans {
        for scope in &mut entry.scope_spans {
            for span in scope
                .spans
                .iter_mut()
                .filter(|span| span.name == FEEDBACK_SPAN)
            {
                span.dropped_events_count += span.events.len() as u32;
                span.events.clear();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use opentelemetry_proto::tonic::resource::v1::Resource;
    use opentelemetry_proto::tonic::trace::v1::span::Event;
    use opentelemetry_proto::tonic::trace::v1::status::StatusCode;
    use opentelemetry_proto::tonic::trace::v1::{ResourceSpans, ScopeSpans, Status};

    fn request(spans: Vec<Span>) -> ExportTraceServiceRequest {
        ExportTraceServiceRequest {
            resource_spans: vec![ResourceSpans {
                resource: Some(Resource {
                    attributes: vec![string_attribute("service.name", "harbor")],
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

    fn body_of(record: &LogRecord) -> &str {
        match record.body.as_ref().unwrap().value.as_ref().unwrap() {
            Value::StringValue(s) => s,
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn feedback_and_errors_become_records_with_the_resource() {
        let logs = app_log_records(&request(vec![
            Span {
                name: FEEDBACK_SPAN.to_string(),
                trace_id: vec![1; 16],
                end_time_unix_nano: 5,
                attributes: vec![
                    string_attribute("harbor.feedback.message", "love it"),
                    string_attribute("harbor.feedback.email", "me@example.com"),
                ],
                ..Default::default()
            },
            Span {
                name: "db.query".to_string(),
                ..Default::default()
            },
            Span {
                name: ERROR_SPAN.to_string(),
                start_time_unix_nano: 7,
                status: Some(Status {
                    code: StatusCode::Error as i32,
                    message: "boom".to_string(),
                }),
                attributes: vec![string_attribute("error.type", "TypeError")],
                ..Default::default()
            },
        ]))
        .unwrap();

        let resource = &logs.resource_logs[0];
        assert_eq!(
            resource.resource.as_ref().unwrap().attributes[0].key,
            "service.name"
        );
        let records = &resource.scope_logs[0].log_records;
        assert_eq!(records.len(), 2);

        assert_eq!(records[0].time_unix_nano, 5);
        assert_eq!(records[0].severity_text, "INFO");
        assert_eq!(body_of(&records[0]), "love it");
        assert_eq!(records[0].trace_id, vec![1; 16]);
        assert_eq!(
            string_value(&records[0].attributes, ATTR_SPAN_NAME),
            Some(FEEDBACK_SPAN)
        );
        assert_eq!(
            string_value(&records[0].attributes, "harbor.feedback.email"),
            Some("me@example.com")
        );

        assert_eq!(records[1].time_unix_nano, 7);
        assert_eq!(records[1].severity_text, "ERROR");
        assert_eq!(body_of(&records[1]), "boom");
        assert_eq!(
            string_value(&records[1].attributes, "error.type"),
            Some("TypeError")
        );
        assert_eq!(
            string_value(&records[1].attributes, ATTR_SPAN_NAME),
            Some(ERROR_SPAN)
        );
    }

    fn log_event(level: &str, message: &str, at: u64) -> Event {
        Event {
            name: "log".to_string(),
            time_unix_nano: at,
            attributes: vec![
                string_attribute("log.severity", level),
                string_attribute("log.message", message),
            ],
            ..Default::default()
        }
    }

    #[test]
    fn feedback_log_lines_become_records_and_leave_the_span() {
        let mut request = request(vec![
            Span {
                name: FEEDBACK_SPAN.to_string(),
                trace_id: vec![1; 16],
                span_id: vec![2; 8],
                attributes: vec![string_attribute("harbor.feedback.message", "love it")],
                events: vec![
                    log_event("warn", "slow feed", 3),
                    log_event("verbose", "odd level", 4),
                ],
                ..Default::default()
            },
            Span {
                name: ERROR_SPAN.to_string(),
                events: vec![log_event("info", "kept", 1)],
                ..Default::default()
            },
        ]);

        let logs = app_log_records(&request).unwrap();
        let records = &logs.resource_logs[0].scope_logs[0].log_records;
        assert_eq!(records.len(), 4);
        assert_eq!(body_of(&records[0]), "love it");
        assert_eq!(records[1].time_unix_nano, 3);
        assert_eq!(records[1].severity_number, SeverityNumber::Warn as i32);
        assert_eq!(records[1].severity_text, "WARN");
        assert_eq!(body_of(&records[1]), "slow feed");
        assert_eq!(records[1].trace_id, vec![1; 16]);
        assert_eq!(records[1].span_id, vec![2; 8]);
        assert_eq!(
            records[2].severity_number,
            SeverityNumber::Unspecified as i32
        );
        assert_eq!(records[2].severity_text, "VERBOSE");
        assert_eq!(body_of(&records[3]), "app.error");

        detach_log_lines(&mut request);
        let spans = &request.resource_spans[0].scope_spans[0].spans;
        assert!(spans[0].events.is_empty());
        assert_eq!(spans[0].dropped_events_count, 2);
        assert_eq!(spans[1].events.len(), 1);
    }

    #[test]
    fn other_spans_yield_nothing() {
        assert!(
            app_log_records(&request(vec![Span {
                name: "db.query".to_string(),
                ..Default::default()
            }]))
            .is_none()
        );
    }
}

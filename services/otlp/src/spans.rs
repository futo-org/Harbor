//! Turns an OTLP/JSON traces payload into a logs payload: one record per
//! span and one per span event, so error reports and feedback land in
//! VictoriaLogs next to the app's logs.

use serde_json::{Map, Value, json};

pub const ATTR_SPAN_NAME: &str = "span.name";
pub const ATTR_EVENT_NAME: &str = "event.name";

const SEVERITY_TRACE: (&str, u8) = ("TRACE", 1);
const SEVERITY_DEBUG: (&str, u8) = ("DEBUG", 5);
const SEVERITY_INFO: (&str, u8) = ("INFO", 9);
const SEVERITY_WARN: (&str, u8) = ("WARN", 13);
const SEVERITY_ERROR: (&str, u8) = ("ERROR", 17);

/// `resourceSpans` to `resourceLogs`. Resources and scopes carry over as
/// they are; each span and each of its events becomes a log record.
pub fn spans_to_logs(payload: &Value) -> Value {
    let resources = payload["resourceSpans"]
        .as_array()
        .map(|entries| entries.iter().map(resource).collect())
        .unwrap_or_default();
    json!({ "resourceLogs": Value::Array(resources) })
}

fn resource(entry: &Value) -> Value {
    let scopes = entry["scopeSpans"]
        .as_array()
        .map(|entries| entries.iter().map(scope).collect())
        .unwrap_or_default();
    let mut out = Map::new();
    if let Some(resource) = entry.get("resource") {
        out.insert("resource".into(), resource.clone());
    }
    if let Some(url) = entry.get("schemaUrl") {
        out.insert("schemaUrl".into(), url.clone());
    }
    out.insert("scopeLogs".into(), Value::Array(scopes));
    Value::Object(out)
}

fn scope(entry: &Value) -> Value {
    let records: Vec<Value> = entry["spans"]
        .as_array()
        .map(|spans| spans.iter().flat_map(span_records).collect())
        .unwrap_or_default();
    let mut out = Map::new();
    if let Some(scope) = entry.get("scope") {
        out.insert("scope".into(), scope.clone());
    }
    out.insert("logRecords".into(), Value::Array(records));
    Value::Object(out)
}

fn span_records(span: &Value) -> Vec<Value> {
    let name = span["name"].as_str().unwrap_or_default();
    let status = &span["status"];
    let severity = if is_error_status(status) {
        SEVERITY_ERROR
    } else {
        SEVERITY_INFO
    };
    let body = status["message"]
        .as_str()
        .filter(|message| !message.is_empty())
        .unwrap_or(name);
    let mut attributes = attributes_of(span);
    attributes.push(string_attribute(ATTR_SPAN_NAME, name));
    let time = span
        .get("endTimeUnixNano")
        .or_else(|| span.get("startTimeUnixNano"))
        .cloned()
        .unwrap_or(Value::Null);

    let mut records = vec![record(span, time, severity, body, attributes)];
    for event in span["events"].as_array().into_iter().flatten() {
        records.push(event_record(span, name, event));
    }
    records
}

fn event_record(span: &Value, span_name: &str, event: &Value) -> Value {
    let event_name = event["name"].as_str().unwrap_or_default();
    let mut attributes = attributes_of(event);
    let body = string_value(&attributes, "log.message")
        .or_else(|| string_value(&attributes, "exception.message"))
        .unwrap_or(event_name)
        .to_string();
    let severity = match string_value(&attributes, "log.severity") {
        Some(level) => severity_of(level),
        None if event_name == "exception" => SEVERITY_ERROR,
        None => SEVERITY_INFO,
    };
    attributes.push(string_attribute(ATTR_EVENT_NAME, event_name));
    attributes.push(string_attribute(ATTR_SPAN_NAME, span_name));
    let time = event.get("timeUnixNano").cloned().unwrap_or(Value::Null);
    record(span, time, severity, &body, attributes)
}

fn record(
    span: &Value,
    time: Value,
    (severity_text, severity_number): (&str, u8),
    body: &str,
    attributes: Vec<Value>,
) -> Value {
    json!({
        "timeUnixNano": time,
        "severityText": severity_text,
        "severityNumber": severity_number,
        "body": { "stringValue": body },
        "attributes": attributes,
        "traceId": span.get("traceId").cloned().unwrap_or(Value::Null),
        "spanId": span.get("spanId").cloned().unwrap_or(Value::Null),
    })
}

/// OTLP/JSON writes enums as numbers (`2`) or names (`STATUS_CODE_ERROR`).
fn is_error_status(status: &Value) -> bool {
    match &status["code"] {
        Value::Number(code) => code.as_u64() == Some(2),
        Value::String(code) => code.ends_with("ERROR"),
        _ => false,
    }
}

fn severity_of(level: &str) -> (&'static str, u8) {
    match level.to_ascii_lowercase().as_str() {
        "trace" => SEVERITY_TRACE,
        "debug" => SEVERITY_DEBUG,
        "warn" | "warning" => SEVERITY_WARN,
        "error" | "fatal" => SEVERITY_ERROR,
        _ => SEVERITY_INFO,
    }
}

fn attributes_of(entry: &Value) -> Vec<Value> {
    entry["attributes"].as_array().cloned().unwrap_or_default()
}

fn string_value<'a>(attributes: &'a [Value], key: &str) -> Option<&'a str> {
    attributes
        .iter()
        .find(|attribute| attribute["key"].as_str() == Some(key))
        .and_then(|attribute| attribute["value"]["stringValue"].as_str())
}

fn string_attribute(key: &str, value: &str) -> Value {
    json!({ "key": key, "value": { "stringValue": value } })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn records(logs: &Value) -> &Vec<Value> {
        logs["resourceLogs"][0]["scopeLogs"][0]["logRecords"]
            .as_array()
            .unwrap()
    }

    fn attribute<'a>(record: &'a Value, key: &str) -> Option<&'a str> {
        string_value(record["attributes"].as_array().unwrap(), key)
    }

    #[test]
    fn an_error_span_is_an_error_record_with_its_status_message() {
        let logs = spans_to_logs(&json!({ "resourceSpans": [{
            "resource": { "attributes": [{ "key": "service.name", "value": { "stringValue": "harbor" } }] },
            "scopeSpans": [{
                "scope": { "name": "harbor" },
                "spans": [{
                    "traceId": "0af7651916cd43dd8448eb211c80319c",
                    "spanId": "b7ad6b7169203331",
                    "name": "app.error",
                    "startTimeUnixNano": "1",
                    "endTimeUnixNano": "2",
                    "status": { "code": 2, "message": "boom" },
                    "attributes": [{ "key": "error.type", "value": { "stringValue": "TypeError" } }]
                }]
            }]
        }]}));

        assert_eq!(
            logs["resourceLogs"][0]["resource"]["attributes"][0]["key"],
            "service.name"
        );
        assert_eq!(
            logs["resourceLogs"][0]["scopeLogs"][0]["scope"]["name"],
            "harbor"
        );
        let records = records(&logs);
        assert_eq!(records.len(), 1);
        let record = &records[0];
        assert_eq!(record["timeUnixNano"], "2");
        assert_eq!(record["severityText"], "ERROR");
        assert_eq!(record["severityNumber"], 17);
        assert_eq!(record["body"]["stringValue"], "boom");
        assert_eq!(record["traceId"], "0af7651916cd43dd8448eb211c80319c");
        assert_eq!(record["spanId"], "b7ad6b7169203331");
        assert_eq!(attribute(record, "error.type"), Some("TypeError"));
        assert_eq!(attribute(record, ATTR_SPAN_NAME), Some("app.error"));
    }

    #[test]
    fn span_events_become_records_of_their_own() {
        let logs = spans_to_logs(&json!({ "resourceSpans": [{ "scopeSpans": [{ "spans": [{
            "traceId": "t",
            "spanId": "s",
            "name": "app.feedback",
            "endTimeUnixNano": "9",
            "status": { "code": "STATUS_CODE_UNSET" },
            "attributes": [{ "key": "harbor.feedback.message", "value": { "stringValue": "hi" } }],
            "events": [
                { "name": "log", "timeUnixNano": "3", "attributes": [
                    { "key": "log.severity", "value": { "stringValue": "warn" } },
                    { "key": "log.message", "value": { "stringValue": "slow" } }
                ]},
                { "name": "exception", "timeUnixNano": "4", "attributes": [
                    { "key": "exception.message", "value": { "stringValue": "nope" } }
                ]},
                { "name": "retry", "timeUnixNano": "5" }
            ]
        }]}]}]}));

        let records = records(&logs);
        assert_eq!(records.len(), 4);
        assert_eq!(records[0]["body"]["stringValue"], "app.feedback");
        assert_eq!(records[0]["severityText"], "INFO");

        assert_eq!(records[1]["timeUnixNano"], "3");
        assert_eq!(records[1]["severityText"], "WARN");
        assert_eq!(records[1]["body"]["stringValue"], "slow");
        assert_eq!(attribute(&records[1], ATTR_EVENT_NAME), Some("log"));
        assert_eq!(attribute(&records[1], ATTR_SPAN_NAME), Some("app.feedback"));
        assert_eq!(records[1]["traceId"], "t");

        assert_eq!(records[2]["severityText"], "ERROR");
        assert_eq!(records[2]["body"]["stringValue"], "nope");

        assert_eq!(records[3]["severityText"], "INFO");
        assert_eq!(records[3]["body"]["stringValue"], "retry");
        assert_eq!(records[3]["timeUnixNano"], "5");
    }

    #[test]
    fn other_shapes_yield_no_records() {
        assert_eq!(
            spans_to_logs(&json!({ "resourceSpans": "nope" })),
            json!({ "resourceLogs": [] })
        );
        assert_eq!(
            spans_to_logs(&json!({ "resourceSpans": [{ "scopeSpans": [{ "spans": "nope" }] }] })),
            json!({ "resourceLogs": [{ "scopeLogs": [{ "logRecords": [] }] }] })
        );
    }
}

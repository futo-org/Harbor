use axum::response::Html;
use prost::Message;
use prost_types::{FileDescriptorSet, SourceCodeInfo};

use crate::service::proto::FILE_DESCRIPTOR_SET;

/// Resolve a path in source_code_info to find the leading comment.
/// Proto paths are documented in descriptor.proto's SourceCodeInfo.
fn find_comment(source_info: &SourceCodeInfo, path: &[i32]) -> Option<String> {
    source_info.location.iter().find_map(|loc| {
        if loc.path == path {
            loc.leading_comments
                .as_ref()
                .map(|c| c.trim().to_string())
                .filter(|c| !c.is_empty())
        } else {
            None
        }
    })
}

fn field_type_name(
    field: &prost_types::FieldDescriptorProto,
    package: &str,
) -> String {
    if let Some(ref type_name) = field.type_name {
        // Strip leading dot and package prefix from fully-qualified names
        let stripped = type_name.strip_prefix('.').unwrap_or(type_name);
        strip_package(stripped, package).to_string()
    } else {
        // Scalar type
        match field.r#type() {
            prost_types::field_descriptor_proto::Type::Double => "double",
            prost_types::field_descriptor_proto::Type::Float => "float",
            prost_types::field_descriptor_proto::Type::Int64 => "int64",
            prost_types::field_descriptor_proto::Type::Uint64 => "uint64",
            prost_types::field_descriptor_proto::Type::Int32 => "int32",
            prost_types::field_descriptor_proto::Type::Fixed64 => "fixed64",
            prost_types::field_descriptor_proto::Type::Fixed32 => "fixed32",
            prost_types::field_descriptor_proto::Type::Bool => "bool",
            prost_types::field_descriptor_proto::Type::String => "string",
            prost_types::field_descriptor_proto::Type::Bytes => "bytes",
            prost_types::field_descriptor_proto::Type::Uint32 => "uint32",
            prost_types::field_descriptor_proto::Type::Sfixed32 => "sfixed32",
            prost_types::field_descriptor_proto::Type::Sfixed64 => "sfixed64",
            prost_types::field_descriptor_proto::Type::Sint32 => "sint32",
            prost_types::field_descriptor_proto::Type::Sint64 => "sint64",
            _ => "unknown",
        }
        .to_string()
    }
}

fn label_str(field: &prost_types::FieldDescriptorProto) -> &'static str {
    match field.label() {
        prost_types::field_descriptor_proto::Label::Optional => "",
        prost_types::field_descriptor_proto::Label::Required => "required ",
        prost_types::field_descriptor_proto::Label::Repeated => "repeated ",
    }
}

/// Strip the package prefix (e.g. "polycentric.") from a fully-qualified name.
fn strip_package<'a>(name: &'a str, package: &str) -> &'a str {
    if package.is_empty() {
        return name;
    }
    name.strip_prefix(package)
        .and_then(|s| s.strip_prefix('.'))
        .unwrap_or(name)
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

pub async fn reflection_ui() -> Html<String> {
    let fds = FileDescriptorSet::decode(FILE_DESCRIPTOR_SET)
        .expect("failed to decode descriptor");

    let mut html = String::from(
        r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>gRPC API Documentation</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; line-height: 1.6; padding: 2rem; max-width: 960px; margin: 0 auto; }
  h1 { color: #58a6ff; margin-bottom: 0.5rem; font-size: 1.8rem; }
  h2 { color: #58a6ff; margin-top: 2rem; margin-bottom: 0.5rem; font-size: 1.4rem; border-bottom: 1px solid #21262d; padding-bottom: 0.3rem; }
  h3 { color: #d2a8ff; margin-top: 1.2rem; margin-bottom: 0.3rem; font-size: 1.1rem; }
  .subtitle { color: #8b949e; margin-bottom: 2rem; }
  .comment { color: #8b949e; font-style: italic; margin-bottom: 0.5rem; }
  .service { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 1.2rem; margin-bottom: 1.5rem; }
  .method { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 1rem; margin: 0.8rem 0; }
  .method-sig { font-family: "JetBrains Mono", "Fira Code", monospace; color: #f0883e; font-size: 0.95rem; }
  .message { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 1.2rem; margin-bottom: 1.5rem; }
  .field { font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 0.9rem; padding: 0.3rem 0; }
  .field-num { color: #8b949e; }
  .field-type { color: #7ee787; }
  .field-label { color: #d2a8ff; }
  .field-name { color: #c9d1d9; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th, td { text-align: left; padding: 0.4rem 0.8rem; border-bottom: 1px solid #21262d; }
  th { color: #8b949e; font-weight: 600; font-size: 0.85rem; text-transform: uppercase; }
  .tag { display: inline-block; background: #1f6feb33; color: #58a6ff; padding: 0.1rem 0.5rem; border-radius: 4px; font-size: 0.8rem; margin-right: 0.3rem; }
</style>
</head>
<body>
<h1>gRPC API Documentation</h1>
<p class="subtitle">Generated from server reflection</p>
"#,
    );

    for file in &fds.file {
        let source_info = file.source_code_info.as_ref();
        let package = file.package.as_deref().unwrap_or("");

        // Services: path [6, service_index]
        for (si, service) in file.service.iter().enumerate() {
            let service_name = service.name.as_deref().unwrap_or("Unknown");

            html.push_str(&format!(
                r#"<div class="service"><h2>{}</h2>"#,
                escape_html(service_name)
            ));

            if let Some(si_info) = source_info
                && let Some(comment) = find_comment(si_info, &[6, si as i32])
            {
                html.push_str(&format!(
                    r#"<p class="comment">{}</p>"#,
                    escape_html(&comment)
                ));
            }

            // Methods: path [6, service_index, 2, method_index]
            for (mi, method) in service.method.iter().enumerate() {
                let method_name = method.name.as_deref().unwrap_or("Unknown");
                let input_raw = method
                    .input_type
                    .as_deref()
                    .unwrap_or("?")
                    .strip_prefix('.')
                    .unwrap_or("?");
                let input = strip_package(input_raw, package);
                let output_raw = method
                    .output_type
                    .as_deref()
                    .unwrap_or("?")
                    .strip_prefix('.')
                    .unwrap_or("?");
                let output = strip_package(output_raw, package);

                html.push_str(r#"<div class="method">"#);

                if let Some(si_info) = source_info
                    && let Some(comment) =
                        find_comment(si_info, &[6, si as i32, 2, mi as i32])
                {
                    html.push_str(&format!(
                        r#"<p class="comment">{}</p>"#,
                        escape_html(&comment)
                    ));
                }

                let client_streaming = method.client_streaming.unwrap_or(false);
                let server_streaming = method.server_streaming.unwrap_or(false);

                let mut tags = String::new();
                if client_streaming {
                    tags.push_str(
                        r#"<span class="tag">client streaming</span>"#,
                    );
                }
                if server_streaming {
                    tags.push_str(
                        r#"<span class="tag">server streaming</span>"#,
                    );
                }
                if !client_streaming && !server_streaming {
                    tags.push_str(r#"<span class="tag">unary</span>"#);
                }

                html.push_str(&format!(
                    r#"<p class="method-sig">{tags} <strong>{}</strong>({}) &rarr; {}</p>"#,
                    escape_html(method_name),
                    escape_html(input),
                    escape_html(output),
                ));

                html.push_str("</div>");
            }

            html.push_str("</div>");
        }

        // Messages: path [4, message_index]
        if !file.message_type.is_empty() {
            html.push_str("<h2>Messages</h2>");
        }

        for (mi, message) in file.message_type.iter().enumerate() {
            let msg_name = message.name.as_deref().unwrap_or("Unknown");

            html.push_str(&format!(
                r#"<div class="message"><h3>{}</h3>"#,
                escape_html(msg_name)
            ));

            if let Some(si_info) = source_info
                && let Some(comment) = find_comment(si_info, &[4, mi as i32])
            {
                html.push_str(&format!(
                    r#"<p class="comment">{}</p>"#,
                    escape_html(&comment)
                ));
            }

            if !message.field.is_empty() {
                html.push_str(
                    r#"<table><tr><th>#</th><th>Field</th><th>Type</th><th>Description</th></tr>"#,
                );

                for (fi, field) in message.field.iter().enumerate() {
                    let fname = field.name.as_deref().unwrap_or("?");
                    let fnum = field.number.unwrap_or(0);
                    let ftype = field_type_name(field, package);
                    let flabel = label_str(field);

                    let field_comment = source_info
                        .and_then(|si| {
                            find_comment(si, &[4, mi as i32, 2, fi as i32])
                        })
                        .or_else(|| {
                            // Also check trailing comments
                            source_info.and_then(|si| {
                                si.location.iter().find_map(|loc| {
                                    if loc.path == [4, mi as i32, 2, fi as i32]
                                    {
                                        loc.trailing_comments
                                            .as_ref()
                                            .map(|c| c.trim().to_string())
                                            .filter(|c| !c.is_empty())
                                    } else {
                                        None
                                    }
                                })
                            })
                        })
                        .unwrap_or_default();

                    html.push_str(&format!(
                        r#"<tr><td class="field-num">{}</td><td class="field-name">{}</td><td><span class="field-label">{}</span><span class="field-type">{}</span></td><td class="comment">{}</td></tr>"#,
                        fnum,
                        escape_html(fname),
                        escape_html(flabel),
                        escape_html(&ftype),
                        escape_html(&field_comment),
                    ));
                }

                html.push_str("</table>");
            }

            html.push_str("</div>");
        }

        // Enums: path [5, enum_index]
        for (ei, enum_type) in file.enum_type.iter().enumerate() {
            let enum_name = enum_type.name.as_deref().unwrap_or("Unknown");

            html.push_str(&format!(
                r#"<div class="message"><h3>enum {}</h3>"#,
                escape_html(enum_name)
            ));

            if let Some(si_info) = source_info
                && let Some(comment) = find_comment(si_info, &[5, ei as i32])
            {
                html.push_str(&format!(
                    r#"<p class="comment">{}</p>"#,
                    escape_html(&comment)
                ));
            }

            if !enum_type.value.is_empty() {
                html.push_str(r#"<table><tr><th>#</th><th>Value</th><th>Description</th></tr>"#);

                for (vi, value) in enum_type.value.iter().enumerate() {
                    let vname = value.name.as_deref().unwrap_or("?");
                    let vnum = value.number.unwrap_or(0);

                    let value_comment = source_info
                        .and_then(|si| {
                            find_comment(si, &[5, ei as i32, 2, vi as i32])
                        })
                        .unwrap_or_default();

                    html.push_str(&format!(
                        r#"<tr><td class="field-num">{}</td><td class="field-name">{}</td><td class="comment">{}</td></tr>"#,
                        vnum,
                        escape_html(vname),
                        escape_html(&value_comment),
                    ));
                }

                html.push_str("</table>");
            }

            html.push_str("</div>");
        }
    }

    html.push_str("</body></html>");
    Html(html)
}

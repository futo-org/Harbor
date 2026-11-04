//! Generates UniFFI records from the v2 proto descriptors.
//!
//! Every message in `polycentric.v2` becomes a `uniffi::Record`, every enum
//! a `uniffi::Enum`, and every oneof a `uniffi::Enum` with one variant per
//! field. UniFFI then generates the same types for each foreign language,
//! so no language defines them by hand.
//!
//! Conversions to and from the prost types (`polycentric_common`'s
//! `protos_v2`) are generated alongside:
//!
//! - prost → record for every message, so anything rs-core holds can be
//!   handed to a host.
//! - record → prost only for messages a host may legitimately build. A
//!   message that carries signed bytes, or contains one that does, has no
//!   such conversion: hosts refer to signed data by key or digest and never
//!   rebuild it.
//!
//! Fields that hold another message's serialized bytes (`VIEWS`) are
//! decoded into that message on the record. Only rs-core sees the bytes.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

use heck::{ToSnakeCase, ToUpperCamelCase};
use prost_types::field_descriptor_proto::{Label, Type};
use prost_types::{
    DescriptorProto, EnumDescriptorProto, FieldDescriptorProto, FileDescriptorSet, SourceCodeInfo,
};

/// Rust path of the prost-generated module for `polycentric.v2`.
const PB: &str = "polycentric_common::models::protos_v2";

/// The proto package the records are generated for.
const PACKAGE: &str = "polycentric.v2";

/// `(message, bytes field, message the bytes decode to, record field name)`.
const VIEWS: &[(&str, &str, &str, &str)] = &[
    ("SignedEvent", "event_bytes", "Event", "event"),
    ("SerializedContent", "content_bytes", "Content", "content"),
    (
        "SerializedVerificationSchema",
        "schema_bytes",
        "VerificationSchema",
        "schema",
    ),
];

/// Views whose decoding goes through a function of the whole message
/// (`fn(&pb::Msg) -> Option<pb::Target>`) instead of a plain decode: a
/// `SignedEvent`'s event is only exposed if its signature verifies.
const CHECKED_VIEWS: &[(&str, &str)] = &[("SignedEvent", "crate::records::verified_event")];

/// `(message, bytes field, digest field)`: when a host's record is turned
/// into this message, rs-core encodes the view and derives the digest over
/// those bytes itself; any digest the host passed is ignored.
const DERIVED_DIGESTS: &[(&str, &str, &str)] =
    &[("SerializedVerificationSchema", "schema_bytes", "digest")];

/// Messages a host must never build: their bytes are signed or hashed, so
/// only rs-core may produce them. Anything containing one is excluded too.
const SEALED: &[&str] = &[
    "SignedEvent",
    "SerializedContent",
    "SignedMessage",
    "SignedIssuerState",
];

/// Names for oneof enums where `<Message><Oneof>` reads badly.
const ONEOF_NAMES: &[(&str, &str, &str)] = &[("AttributedTo", "to", "AttributionTarget")];

/// Messages that aren't useful to a host: wire envelopes rs-core builds
/// internally. They still get records (other records may contain them),
/// but no record → prost conversion.
const INTERNAL: &[&str] = &[
    "SyncContentRequest",
    "UploadBlobRequest",
    "IssuerPairingState",
];

struct Message {
    /// Fully qualified proto name without the leading dot, e.g.
    /// `polycentric.v2.GetFeedResponse.Item`.
    full: String,
    /// Record name, e.g. `GetFeedResponseItem`.
    record: String,
    /// Path of the prost type relative to `PB`, e.g. `get_feed_response::Item`.
    prost: String,
    doc: String,
    fields: Vec<Field>,
    oneofs: Vec<Oneof>,
    map_entry: bool,
}

struct Oneof {
    /// Record enum name.
    record: String,
    /// Path of the prost enum relative to `PB`.
    prost: String,
    /// Field name on the message (snake case).
    field: String,
    doc: String,
    variants: Vec<Field>,
}

#[derive(Clone)]
struct Field {
    name: String,
    /// Field name as Rust spells it (prost sanitizes keywords).
    rust: String,
    ty: Ty,
    shape: Shape,
    doc: String,
}

#[derive(Clone, PartialEq)]
enum Ty {
    Scalar(&'static str),
    Enum(String),
    Message(String),
}

#[derive(Clone, PartialEq)]
enum Shape {
    /// A plain field. Messages are `Option<T>` in prost and on the record.
    Single,
    /// A proto3 `optional` scalar or enum.
    Optional,
    Repeated,
    /// `map<K, V>`; the key is always a scalar.
    Map(&'static str, Box<Ty>),
    /// A member of a oneof (only used for oneof variants).
    Variant,
    /// A view: bytes on the wire, the decoded message on the record.
    View(String),
}

struct Enum {
    record: String,
    prost: String,
    doc: String,
    values: Vec<(String, i32, String)>,
}

/// Generate the records module for `fds` as Rust source.
pub fn generate(fds: &FileDescriptorSet) -> String {
    let mut messages = Vec::new();
    let mut enums = Vec::new();
    for file in &fds.file {
        if file.package() != PACKAGE {
            continue;
        }
        let info = file.source_code_info.clone().unwrap_or_default();
        for (i, message) in file.message_type.iter().enumerate() {
            collect_message(
                message,
                &[],
                &[4, i as i32],
                &info,
                &mut messages,
                &mut enums,
            );
        }
        for (i, e) in file.enum_type.iter().enumerate() {
            enums.push(collect_enum(e, &[], &[5, i as i32], &info));
        }
    }

    let maps: BTreeMap<String, (&'static str, Ty)> = messages
        .iter()
        .filter(|m| m.map_entry)
        .map(|m| {
            let key = match &m.fields[0].ty {
                Ty::Scalar(s) => *s,
                _ => panic!("map key of {} isn't a scalar", m.full),
            };
            (m.full.clone(), (key, m.fields[1].ty.clone()))
        })
        .collect();
    // Turn repeated map-entry fields into maps.
    for message in &mut messages {
        for field in message.fields.iter_mut() {
            if let (Shape::Repeated, Ty::Message(name)) = (&field.shape, &field.ty)
                && let Some((key, value)) = maps.get(name)
            {
                field.shape = Shape::Map(key, Box::new(value.clone()));
            }
        }
    }
    messages.retain(|m| !m.map_entry);

    // Apply views.
    for (message, field, target, rename) in VIEWS {
        let full = format!("{PACKAGE}.{message}");
        let m = messages
            .iter_mut()
            .find(|m| m.full == full)
            .unwrap_or_else(|| panic!("view on unknown message {message}"));
        let f = m
            .fields
            .iter_mut()
            .find(|f| f.name == *field)
            .unwrap_or_else(|| panic!("view on unknown field {message}.{field}"));
        f.shape = Shape::View(f.rust.clone());
        f.doc = format!(
            "/// The `{target}` carried as `{field}` on the wire, decoded by rs-core.\n\
             /// Only rs-core handles the bytes; `None` if they don't decode.\n"
        );
        f.ty = Ty::Message(format!("{PACKAGE}.{target}"));
        f.name = rename.to_string();
        f.rust = sanitize(rename);
    }

    let records: BTreeMap<String, String> = messages
        .iter()
        .map(|m| (m.full.clone(), m.record.clone()))
        .collect();
    let enum_names: BTreeMap<String, String> = enums
        .iter()
        .map(|e| (e.record.clone(), e.record.clone()))
        .collect();
    let enum_by_full: BTreeMap<String, String> = enums
        .iter()
        .map(|e| {
            (
                format!("{PACKAGE}.{}", e.prost.replace("::", ".")),
                e.record.clone(),
            )
        })
        .collect();
    let _ = enum_names;

    let buildable = buildable_messages(&messages);

    let ctx = Ctx {
        records: &records,
        enums: &enum_by_full,
    };

    let mut out = String::new();
    out.push_str(
        "// @generated by rs-core/build/records.rs from the polycentric.v2 protos.\n\
         // Do not edit.\n\n",
    );
    for e in &enums {
        write_enum(&mut out, e);
    }
    for m in &messages {
        write_record(&mut out, m, &ctx, buildable.contains(&m.full));
    }
    out
}

struct Ctx<'a> {
    records: &'a BTreeMap<String, String>,
    enums: &'a BTreeMap<String, String>,
}

impl Ctx<'_> {
    fn record(&self, full: &str) -> &str {
        self.records
            .get(full)
            .unwrap_or_else(|| panic!("no record for {full}"))
    }
    fn enumeration(&self, full: &str) -> &str {
        self.enums
            .get(full)
            .unwrap_or_else(|| panic!("no enum for {full}"))
    }

    /// The record-side type of `ty` on its own.
    fn base(&self, ty: &Ty) -> String {
        match ty {
            Ty::Scalar(s) => s.to_string(),
            Ty::Enum(full) => self.enumeration(full).to_string(),
            Ty::Message(full) => self.record(full).to_string(),
        }
    }

    fn record_type(&self, field: &Field) -> String {
        if let Shape::Map(key, value) = &field.shape {
            return format!("std::collections::HashMap<{key}, {}>", self.base(value));
        }
        let base = self.base(&field.ty);
        match &field.shape {
            Shape::Single => match field.ty {
                Ty::Message(_) => format!("Option<{base}>"),
                _ => base,
            },
            Shape::Optional | Shape::View(_) => format!("Option<{base}>"),
            Shape::Repeated => format!("Vec<{base}>"),
            Shape::Map(..) => unreachable!(),
            Shape::Variant => base,
        }
    }
}

/// Messages whose records may be converted back into prost: neither
/// sealed nor internal, and containing nothing that is.
fn buildable_messages(messages: &[Message]) -> BTreeSet<String> {
    let blocked: BTreeSet<String> = SEALED
        .iter()
        .chain(INTERNAL)
        .map(|m| format!("{PACKAGE}.{m}"))
        .collect();
    let mut buildable: BTreeSet<String> = messages
        .iter()
        .map(|m| m.full.clone())
        .filter(|m| !blocked.contains(m))
        .collect();
    loop {
        let mut changed = false;
        for m in messages {
            if !buildable.contains(&m.full) {
                continue;
            }
            let fields = m
                .fields
                .iter()
                .chain(m.oneofs.iter().flat_map(|o| o.variants.iter()));
            let ok = fields.into_iter().all(|f| {
                let inner = match (&f.shape, &f.ty) {
                    (Shape::Map(_, value), _) => match value.as_ref() {
                        Ty::Message(n) => Some(n),
                        _ => None,
                    },
                    (_, Ty::Message(n)) => Some(n),
                    _ => None,
                };
                inner.is_none_or(|n| buildable.contains(n))
            });
            if !ok {
                buildable.remove(&m.full);
                changed = true;
            }
        }
        if !changed {
            return buildable;
        }
    }
}

fn collect_message(
    message: &DescriptorProto,
    parents: &[&str],
    path: &[i32],
    info: &SourceCodeInfo,
    messages: &mut Vec<Message>,
    enums: &mut Vec<Enum>,
) {
    let name = message.name();
    let mut chain: Vec<&str> = parents.to_vec();
    chain.push(name);

    let full = format!("{PACKAGE}.{}", chain.join("."));
    let record = chain.concat();
    let prost = prost_path(&chain);
    let map_entry = message
        .options
        .as_ref()
        .is_some_and(|o| o.map_entry.unwrap_or(false));

    // Real oneofs: a proto3 `optional` is a synthetic oneof prost turns
    // back into an `Option`.
    let synthetic: BTreeSet<i32> = message
        .field
        .iter()
        .filter(|f| f.proto3_optional.unwrap_or(false))
        .filter_map(|f| f.oneof_index)
        .collect();

    let mut fields = Vec::new();
    let mut oneofs: Vec<Oneof> = message
        .oneof_decl
        .iter()
        .enumerate()
        .filter(|(i, _)| !synthetic.contains(&(*i as i32)))
        .map(|(i, o)| {
            let field = o.name().to_string();
            let record = ONEOF_NAMES
                .iter()
                .find(|(m, f, _)| *m == name && *f == field)
                .map(|(_, _, r)| r.to_string())
                .unwrap_or_else(|| {
                    let camel = field.to_upper_camel_case();
                    if camel.starts_with(name) {
                        camel
                    } else {
                        format!("{name}{camel}")
                    }
                });
            let mut oneof_path = path.to_vec();
            oneof_path.extend([8, i as i32]);
            let mut prost_chain: Vec<&str> = chain.clone();
            let camel = field.to_upper_camel_case();
            prost_chain.push(&camel);
            Oneof {
                record,
                prost: prost_path(&prost_chain),
                field: sanitize(&field.to_snake_case()),
                doc: doc_at(info, &oneof_path),
                variants: Vec::new(),
            }
        })
        .collect();
    // Map a oneof_decl index to its position in `oneofs`.
    let oneof_slot = |index: i32| -> Option<usize> {
        let real: Vec<usize> = (0..message.oneof_decl.len())
            .filter(|i| !synthetic.contains(&(*i as i32)))
            .collect();
        real.iter().position(|i| *i == index as usize)
    };

    for (i, f) in message.field.iter().enumerate() {
        let mut field_path = path.to_vec();
        field_path.extend([2, i as i32]);
        let mut field = make_field(f, doc_at(info, &field_path));
        match f.oneof_index {
            Some(index) if !f.proto3_optional.unwrap_or(false) => {
                field.shape = Shape::Variant;
                let slot = oneof_slot(index).expect("oneof index");
                oneofs[slot].variants.push(field);
            }
            _ => fields.push(field),
        }
    }

    messages.push(Message {
        full,
        record,
        prost,
        doc: doc_at(info, path),
        fields,
        oneofs,
        map_entry,
    });

    for (i, nested) in message.nested_type.iter().enumerate() {
        let mut nested_path = path.to_vec();
        nested_path.extend([3, i as i32]);
        collect_message(nested, &chain, &nested_path, info, messages, enums);
    }
    for (i, e) in message.enum_type.iter().enumerate() {
        let mut enum_path = path.to_vec();
        enum_path.extend([4, i as i32]);
        enums.push(collect_enum(e, &chain, &enum_path, info));
    }
}

fn make_field(f: &FieldDescriptorProto, doc: String) -> Field {
    let ty = match f.r#type() {
        Type::Double => Ty::Scalar("f64"),
        Type::Float => Ty::Scalar("f32"),
        Type::Int64 | Type::Sint64 | Type::Sfixed64 => Ty::Scalar("i64"),
        Type::Uint64 | Type::Fixed64 => Ty::Scalar("u64"),
        Type::Int32 | Type::Sint32 | Type::Sfixed32 => Ty::Scalar("i32"),
        Type::Uint32 | Type::Fixed32 => Ty::Scalar("u32"),
        Type::Bool => Ty::Scalar("bool"),
        Type::String => Ty::Scalar("String"),
        Type::Bytes => Ty::Scalar("Vec<u8>"),
        Type::Enum => Ty::Enum(f.type_name().trim_start_matches('.').to_string()),
        Type::Message => Ty::Message(f.type_name().trim_start_matches('.').to_string()),
        Type::Group => panic!("groups aren't supported"),
    };
    let shape = if f.label() == Label::Repeated {
        Shape::Repeated
    } else if f.proto3_optional.unwrap_or(false) {
        Shape::Optional
    } else {
        Shape::Single
    };
    Field {
        name: f.name().to_string(),
        rust: sanitize(&f.name().to_snake_case()),
        ty,
        shape,
        doc,
    }
}

fn collect_enum(
    e: &EnumDescriptorProto,
    parents: &[&str],
    path: &[i32],
    info: &SourceCodeInfo,
) -> Enum {
    let name = e.name();
    let mut chain: Vec<&str> = parents.to_vec();
    chain.push(name);
    let prefix = name.to_upper_camel_case();
    let values = e
        .value
        .iter()
        .enumerate()
        .map(|(i, v)| {
            let camel = v.name().to_upper_camel_case();
            let stripped = camel
                .strip_prefix(&prefix)
                .filter(|s| s.starts_with(|c: char| c.is_ascii_uppercase()))
                .unwrap_or(&camel)
                .to_string();
            let mut value_path = path.to_vec();
            value_path.extend([2, i as i32]);
            (stripped, v.number(), doc_at(info, &value_path))
        })
        .collect::<Vec<_>>();
    assert!(
        values.first().is_some_and(|(_, n, _)| *n == 0),
        "enum {name} doesn't start at 0"
    );
    Enum {
        record: chain.concat(),
        prost: chain.join("::"),
        doc: doc_at(info, path),
        values,
    }
}

/// prost's path for a (possibly nested) type: parent messages become
/// snake-case modules.
fn prost_path(chain: &[&str]) -> String {
    let (last, parents) = chain.split_last().expect("non-empty");
    let mut parts: Vec<String> = parents
        .iter()
        .map(|p| sanitize(&p.to_snake_case()))
        .collect();
    parts.push(sanitize(&last.to_upper_camel_case()));
    parts.join("::")
}

/// Keywords as prost spells them.
fn sanitize(ident: &str) -> String {
    match ident {
        "as" | "break" | "const" | "continue" | "else" | "enum" | "false" | "fn" | "for" | "if"
        | "impl" | "in" | "let" | "loop" | "match" | "mod" | "move" | "mut" | "pub" | "ref"
        | "return" | "static" | "struct" | "trait" | "true" | "type" | "unsafe" | "use"
        | "where" | "while" | "dyn" | "abstract" | "become" | "box" | "do" | "final" | "macro"
        | "override" | "priv" | "typeof" | "unsized" | "virtual" | "yield" | "async" | "await"
        | "try" | "gen" => format!("r#{ident}"),
        "_" | "super" | "self" | "Self" | "extern" | "crate" => format!("{ident}_"),
        s if s.starts_with(|c: char| c.is_numeric()) => format!("_{ident}"),
        _ => ident.to_string(),
    }
}

/// The leading comment at `path`, as `///` lines.
fn doc_at(info: &SourceCodeInfo, path: &[i32]) -> String {
    let Some(location) = info.location.iter().find(|l| l.path == path) else {
        return String::new();
    };
    let text = location
        .leading_comments
        .as_deref()
        .or(location.trailing_comments.as_deref())
        .unwrap_or("");
    doc_lines(text)
}

fn doc_lines(text: &str) -> String {
    let lines: Vec<&str> = text.trim_end().lines().collect();
    let mut out = String::new();
    for line in lines {
        // Block comments come through with leading `*`s.
        let line = line.trim_start().trim_start_matches('*').trim_end();
        let line = line.strip_prefix(' ').unwrap_or(line);
        if line.is_empty() {
            out.push_str("///\n");
        } else {
            // `[` would start an intra-doc link.
            let line = line.replace('[', "\\[").replace(']', "\\]");
            let _ = writeln!(out, "/// {line}");
        }
    }
    out
}

fn indent(doc: &str, by: &str) -> String {
    doc.lines().map(|l| format!("{by}{l}\n")).collect()
}

fn write_enum(out: &mut String, e: &Enum) {
    out.push_str(&e.doc);
    let _ = writeln!(
        out,
        "#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, uniffi::Enum)]\npub enum {} {{",
        e.record
    );
    for (i, (name, _, doc)) in e.values.iter().enumerate() {
        out.push_str(&indent(doc, "    "));
        if i == 0 {
            out.push_str("    #[default]\n");
        }
        let _ = writeln!(out, "    {name},");
    }
    out.push_str("}\n\n");

    // Unknown values (a newer schema) read as the zero value.
    let _ = writeln!(
        out,
        "impl From<i32> for {} {{\n    fn from(value: i32) -> Self {{\n        match value {{",
        e.record
    );
    for (name, number, _) in &e.values {
        let _ = writeln!(out, "            {number} => Self::{name},");
    }
    out.push_str("            _ => Self::default(),\n        }\n    }\n}\n\n");

    let _ = writeln!(
        out,
        "impl From<{0}> for i32 {{\n    fn from(value: {0}) -> Self {{\n        match value {{",
        e.record
    );
    for (name, number, _) in &e.values {
        let _ = writeln!(out, "            {}::{name} => {number},", e.record);
    }
    out.push_str("        }\n    }\n}\n\n");
}

fn write_record(out: &mut String, m: &Message, ctx: &Ctx, buildable: bool) {
    // Oneof enums first.
    for o in &m.oneofs {
        out.push_str(&o.doc);
        let _ = writeln!(
            out,
            "#[derive(Clone, Debug, PartialEq, uniffi::Enum)]\npub enum {} {{",
            o.record
        );
        for v in &o.variants {
            out.push_str(&indent(&v.doc, "    "));
            let _ = writeln!(
                out,
                "    {} {{ {}: {} }},",
                v.name.to_upper_camel_case(),
                v.rust,
                ctx.record_type(v)
            );
        }
        out.push_str("}\n\n");

        // prost → record
        let _ = writeln!(
            out,
            "impl From<{PB}::{}> for {} {{\n    fn from(value: {PB}::{}) -> Self {{\n        match value {{",
            o.prost, o.record, o.prost
        );
        for v in &o.variants {
            let variant = v.name.to_upper_camel_case();
            let _ = writeln!(
                out,
                "            {PB}::{}::{variant}(v) => Self::{variant} {{ {}: {} }},",
                o.prost,
                v.rust,
                to_record_expr(v, "v")
            );
        }
        out.push_str("        }\n    }\n}\n\n");

        if buildable {
            let _ = writeln!(
                out,
                "impl From<{0}> for {PB}::{1} {{\n    fn from(value: {0}) -> Self {{\n        match value {{",
                o.record, o.prost
            );
            for v in &o.variants {
                let variant = v.name.to_upper_camel_case();
                let _ = writeln!(
                    out,
                    "            {}::{variant} {{ {} }} => Self::{variant}({}),",
                    o.record,
                    v.rust,
                    to_prost_expr(v, &v.rust, ctx)
                );
            }
            out.push_str("        }\n    }\n}\n\n");
        }
    }

    out.push_str(&m.doc);
    let _ = writeln!(
        out,
        "#[derive(Clone, Debug, Default, PartialEq, uniffi::Record)]\npub struct {} {{",
        m.record
    );
    for f in &m.fields {
        out.push_str(&indent(&f.doc, "    "));
        // UniFFI's proc macros can't name an enum variant as a default, so a
        // plain enum field has none and callers set it.
        if !matches!((&f.shape, &f.ty), (Shape::Single, Ty::Enum(_))) {
            out.push_str("    #[uniffi(default)]\n");
        }
        let _ = writeln!(out, "    pub {}: {},", f.rust, ctx.record_type(f));
    }
    for o in &m.oneofs {
        out.push_str(&indent(&o.doc, "    "));
        out.push_str("    #[uniffi(default)]\n");
        let _ = writeln!(out, "    pub {}: Option<{}>,", o.field, o.record);
    }
    out.push_str("}\n\n");

    // prost → record
    let checked = CHECKED_VIEWS
        .iter()
        .find(|(name, _)| format!("{PACKAGE}.{name}") == m.full)
        .map(|(_, check)| *check);
    let _ = writeln!(
        out,
        "impl From<{PB}::{0}> for {1} {{\n    #[allow(unused_variables)]\n    fn from(value: {PB}::{0}) -> Self {{",
        m.prost, m.record
    );
    if let Some(check) = checked {
        let _ = writeln!(out, "        let checked = {check}(&value);");
    }
    out.push_str("        Self {\n");
    for f in &m.fields {
        let expr = match (&f.shape, checked) {
            (Shape::View(_), Some(_)) => "checked.map(Into::into)".to_string(),
            (Shape::View(bytes_field), None) => to_record_expr(f, &format!("value.{bytes_field}")),
            _ => to_record_expr(f, &format!("value.{}", f.rust)),
        };
        let _ = writeln!(out, "            {}: {},", f.rust, expr);
    }
    for o in &m.oneofs {
        let _ = writeln!(out, "            {0}: value.{0}.map(Into::into),", o.field);
    }
    out.push_str("        }\n    }\n}\n\n");

    if buildable {
        let derived = DERIVED_DIGESTS
            .iter()
            .find(|(name, _, _)| format!("{PACKAGE}.{name}") == m.full);
        let _ = writeln!(
            out,
            "impl From<{1}> for {PB}::{0} {{\n    #[allow(unused_variables)]\n    fn from(value: {1}) -> Self {{",
            m.prost, m.record
        );
        if let Some((_, bytes_field, _)) = derived {
            let view = m
                .fields
                .iter()
                .find(|f| matches!(&f.shape, Shape::View(b) if b == bytes_field))
                .expect("derived digest over a view");
            let _ = writeln!(
                out,
                "        let {bytes_field} = {};",
                to_prost_expr(view, &format!("value.{}", view.rust), ctx)
            );
        }
        out.push_str("        Self {\n");
        for f in &m.fields {
            let target = match &f.shape {
                Shape::View(bytes_field) => bytes_field.clone(),
                _ => f.rust.clone(),
            };
            let expr = match derived {
                Some((_, bytes_field, _)) if &target == bytes_field => {
                    format!("{bytes_field}.clone()")
                }
                Some((_, bytes_field, digest)) if &target == digest => {
                    format!("Some(crate::sdk::client::content_digest_of_bytes(&{bytes_field}))")
                }
                _ => to_prost_expr(f, &format!("value.{}", f.rust), ctx),
            };
            let _ = writeln!(out, "            {target}: {expr},");
        }
        for o in &m.oneofs {
            let _ = writeln!(out, "            {0}: value.{0}.map(Into::into),", o.field);
        }
        out.push_str("        }\n    }\n}\n\n");
    }
}

/// Converts `src` (a prost value) to the record shape of `f`.
fn to_record_expr(f: &Field, src: &str) -> String {
    let convert = |ty: &Ty| matches!(ty, Ty::Enum(_) | Ty::Message(_));
    match &f.shape {
        Shape::View(_) => {
            let Ty::Message(full) = &f.ty else {
                unreachable!()
            };
            let prost = prost_path(
                &full
                    .trim_start_matches(&format!("{PACKAGE}."))
                    .split('.')
                    .collect::<Vec<_>>(),
            );
            format!(
                "<{PB}::{prost} as prost::Message>::decode({src}.as_slice()).ok().map(Into::into)"
            )
        }
        Shape::Single | Shape::Variant => match (&f.ty, &f.shape) {
            (Ty::Message(_), Shape::Single) => format!("{src}.map(Into::into)"),
            (ty, _) if convert(ty) => format!("{src}.into()"),
            _ => src.to_string(),
        },
        Shape::Optional => {
            if convert(&f.ty) {
                format!("{src}.map(Into::into)")
            } else {
                src.to_string()
            }
        }
        Shape::Repeated => {
            if convert(&f.ty) {
                format!("{src}.into_iter().map(Into::into).collect()")
            } else {
                src.to_string()
            }
        }
        Shape::Map(_, value) => {
            if convert(value) {
                format!("{src}.into_iter().map(|(k, v)| (k, v.into())).collect()")
            } else {
                format!("{src}.into_iter().collect()")
            }
        }
    }
}

/// Converts `src` (a record value) to the prost shape of `f`.
fn to_prost_expr(f: &Field, src: &str, ctx: &Ctx) -> String {
    let _ = ctx;
    let convert = |ty: &Ty| matches!(ty, Ty::Enum(_) | Ty::Message(_));
    match &f.shape {
        Shape::View(_) => {
            let Ty::Message(full) = &f.ty else {
                unreachable!()
            };
            let prost = prost_path(
                &full
                    .trim_start_matches(&format!("{PACKAGE}."))
                    .split('.')
                    .collect::<Vec<_>>(),
            );
            format!(
                "{src}.map(|v| prost::Message::encode_to_vec(&{PB}::{prost}::from(v))).unwrap_or_default()"
            )
        }
        Shape::Single | Shape::Variant => match (&f.ty, &f.shape) {
            (Ty::Message(_), Shape::Single) => format!("{src}.map(Into::into)"),
            (ty, _) if convert(ty) => format!("{src}.into()"),
            _ => src.to_string(),
        },
        Shape::Optional => {
            if convert(&f.ty) {
                format!("{src}.map(Into::into)")
            } else {
                src.to_string()
            }
        }
        Shape::Repeated => {
            if convert(&f.ty) {
                format!("{src}.into_iter().map(Into::into).collect()")
            } else {
                src.to_string()
            }
        }
        Shape::Map(_, value) => {
            if convert(value) {
                format!("{src}.into_iter().map(|(k, v)| (k, v.into())).collect()")
            } else {
                format!("{src}.into_iter().collect()")
            }
        }
    }
}

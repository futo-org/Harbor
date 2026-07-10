use super::{ChildContext, map_db_err};
use crate::service::proto::{FieldKind, VerificationClaim, VerificationSchema};
use ::entity::{
    content_verification_claim_model as ContentVerificationClaimModel,
    verification_schema_model as VerificationSchemaModel,
};
use base64::prelude::*;
use prost::Message;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ConnectionTrait, DbErr, EntityTrait,
    sea_query::OnConflict,
};
use std::collections::HashMap;
use tonic::Status;

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    claim: VerificationClaim,
) -> Result<(), Status> {
    let schema = claim.schema.ok_or_else(|| {
        Status::invalid_argument("verification claim missing schema")
    })?;
    let fields = decode_fields(&schema.schema_bytes, &claim.fields);
    let digest = schema.digest.ok_or_else(|| {
        Status::invalid_argument("verification claim missing schema digest")
    })?;

    // Store the schema once, keyed by digest; a conflict means it already
    // exists, so treat that as a no-op.
    let schema_json =
        VerificationSchema::decode(schema.schema_bytes.as_slice())
            .map(|s| schema_to_json(&s))
            .unwrap_or(serde_json::Value::Null);

    let schema_insert = VerificationSchemaModel::Entity::insert(
        VerificationSchemaModel::ActiveModel {
            digest_type: Set(digest.r#type),
            digest_bytes: Set(digest.value.clone()),
            schema_bytes: Set(schema.schema_bytes.clone()),
            schema: Set(schema_json),
        },
    )
    .on_conflict(
        OnConflict::columns([
            VerificationSchemaModel::Column::DigestType,
            VerificationSchemaModel::Column::DigestBytes,
        ])
        .do_nothing()
        .to_owned(),
    )
    .exec(db)
    .await;
    match schema_insert {
        Ok(_) | Err(DbErr::RecordNotInserted | DbErr::RecordNotFound(_)) => {}
        Err(e) => return Err(map_db_err(e)),
    }

    ContentVerificationClaimModel::ActiveModel {
        content_id: Set(ctx.content_id),
        schema_digest_type: Set(digest.r#type),
        schema_digest_bytes: Set(digest.value),
        fields: Set(fields),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}

/// Decode a claim's `fields` into a JSON object, interpreting each value
/// per its schema `FieldKind`. Fields absent from the schema are skipped;
/// bytes are base64-encoded.
fn decode_fields(
    schema_bytes: &[u8],
    fields: &HashMap<String, Vec<u8>>,
) -> serde_json::Value {
    let Ok(schema) = VerificationSchema::decode(schema_bytes) else {
        return serde_json::Value::Object(serde_json::Map::new());
    };

    let mut object = serde_json::Map::new();
    for field in schema.fields {
        let Some(bytes) = fields.get(&field.key) else {
            continue;
        };
        let value = match FieldKind::try_from(field.kind)
            .unwrap_or(FieldKind::Unspecified)
        {
            FieldKind::String => {
                String::from_utf8_lossy(bytes).into_owned().into()
            }
            FieldKind::Int => {
                let mut buf = [0u8; 8];
                if bytes.len() == 8 {
                    buf.copy_from_slice(bytes);
                }
                i64::from_le_bytes(buf).into()
            }
            FieldKind::Bool => bytes.first().is_some_and(|b| *b != 0).into(),
            FieldKind::Bytes | FieldKind::Unspecified => {
                BASE64_STANDARD.encode(bytes).into()
            }
        };
        object.insert(field.key, value);
    }

    serde_json::Value::Object(object)
}

/// Decode a `VerificationSchema` into a JSON object for querying.
fn schema_to_json(schema: &VerificationSchema) -> serde_json::Value {
    let fields: Vec<serde_json::Value> = schema
        .fields
        .iter()
        .map(|f| {
            serde_json::json!({
                "key": f.key,
                "kind": FieldKind::try_from(f.kind)
                    .unwrap_or(FieldKind::Unspecified)
                    .as_str_name(),
                "format": f.format,
                "required": f.required,
                "description": f.description,
                "regex": f.regex,
                "max_len": f.max_len,
            })
        })
        .collect();

    serde_json::json!({
        "name": schema.name,
        "description": schema.description,
        "fields": fields,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::proto::FieldDef;

    fn field(key: &str, kind: FieldKind) -> FieldDef {
        FieldDef {
            key: key.to_string(),
            kind: kind as i32,
            format: String::new(),
            required: false,
            description: String::new(),
            regex: None,
            max_len: None,
        }
    }

    fn schema(fields: Vec<FieldDef>) -> VerificationSchema {
        VerificationSchema {
            name: "X Verification".to_string(),
            description: "desc".to_string(),
            fields,
        }
    }

    #[test]
    fn decode_fields_interprets_each_kind() {
        let s = schema(vec![
            field("name", FieldKind::String),
            field("count", FieldKind::Int),
            field("ok", FieldKind::Bool),
            field("raw", FieldKind::Bytes),
        ]);
        let schema_bytes = s.encode_to_vec();

        let mut fields = HashMap::new();
        fields.insert("name".to_string(), b"alice".to_vec());
        fields.insert("count".to_string(), 42i64.to_le_bytes().to_vec());
        fields.insert("ok".to_string(), vec![1u8]);
        fields.insert("raw".to_string(), vec![0xDE, 0xAD]);

        let json = decode_fields(&schema_bytes, &fields);
        assert_eq!(json["name"], serde_json::json!("alice"));
        assert_eq!(json["count"], serde_json::json!(42));
        assert_eq!(json["ok"], serde_json::json!(true));
        assert_eq!(
            json["raw"],
            serde_json::json!(BASE64_STANDARD.encode([0xDE, 0xAD]))
        );
    }

    #[test]
    fn decode_fields_skips_fields_absent_from_claim() {
        let s = schema(vec![field("name", FieldKind::String)]);
        let json = decode_fields(&s.encode_to_vec(), &HashMap::new());
        assert_eq!(json, serde_json::json!({}));
    }

    #[test]
    fn decode_fields_on_undecodable_schema_is_empty_object() {
        let json = decode_fields(&[0xFF], &HashMap::new());
        assert_eq!(json, serde_json::json!({}));
    }

    #[test]
    fn schema_to_json_captures_name_and_fields() {
        let s = schema(vec![field("handle", FieldKind::String)]);
        let json = schema_to_json(&s);
        assert_eq!(json["name"], serde_json::json!("X Verification"));
        assert_eq!(json["fields"][0]["key"], serde_json::json!("handle"));
        assert_eq!(
            json["fields"][0]["kind"],
            serde_json::json!("FIELD_KIND_STRING")
        );
    }

    #[tokio::test]
    async fn add_missing_schema_errors() {
        let db = sea_orm::MockDatabase::new(sea_orm::DatabaseBackend::Postgres)
            .into_connection();
        let err = add(
            &db,
            &ChildContext {
                content_id: 1,
                event_identity: "alice",
            },
            VerificationClaim {
                schema: None,
                fields: Default::default(),
            },
        )
        .await
        .unwrap_err();
        assert_eq!(err.code(), tonic::Code::InvalidArgument);
        assert!(db.into_transaction_log().is_empty());
    }
}

use super::{ChildContext, map_db_err};
use crate::service::proto::{Identity, PublicKey, RevocationBound};
use crate::util;
use ::entity::content_identity_model as ContentIdentityModel;
use prost::Message;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ConnectionTrait};
use serde_json::json;
use tonic::Status;

fn key_to_json(key: &PublicKey) -> serde_json::Value {
    json!({
        "key_type": key.key_type,
        "key": util::hex::encode(&key.key),
    })
}

fn keys_to_json(keys: &[PublicKey]) -> serde_json::Value {
    serde_json::Value::Array(keys.iter().map(key_to_json).collect())
}

fn revocation_bounds_to_json(bounds: &[RevocationBound]) -> serde_json::Value {
    serde_json::Value::Array(
        bounds
            .iter()
            .map(|b| {
                json!({
                    "revoked_key": b.revoked_key.as_ref().map(key_to_json),
                    "targets": b
                        .targets
                        .iter()
                        .map(|t| json!({
                            "collection": t.collection,
                            "signature": util::hex::encode(&t.signature),
                            "root": util::hex::encode(&t.root),
                            "leaf_count": t.leaf_count,
                        }))
                        .collect::<Vec<_>>(),
                })
            })
            .collect(),
    )
}

pub(super) async fn add<C: ConnectionTrait>(
    db: &C,
    ctx: &ChildContext<'_>,
    identity: Identity,
) -> Result<(), Status> {
    ContentIdentityModel::ActiveModel {
        content_id: Set(ctx.content_id),
        identity: Set(ctx.event_identity.to_string()),
        identity_bytes: Set(identity.encode_to_vec()),
        rotation_keys: Set(keys_to_json(&identity.rotation_keys)),
        signing_keys: Set(keys_to_json(&identity.signing_keys)),
        revocation_bounds: Set(revocation_bounds_to_json(
            &identity.revocation_bounds,
        )),
        servers: Set(identity.servers.as_ref().map(|s| json!(s.urls))),
    }
    .insert(db)
    .await
    .map_err(map_db_err)?;

    Ok(())
}

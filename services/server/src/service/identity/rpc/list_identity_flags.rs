//! `list_identity_flags`: returns the server-administered flags on an
//! identity after verifying the request is signed by one of the
//! identity's authorized keys.

use crate::service::identity::pairing::rpc::common::verify_signed_message;
use crate::service::identity::repository as id_repo;
use crate::service::proto as Proto;
use crate::service::proto::{ListIdentityFlagsResponse, SignedMessage};
use chrono::Utc;
use prost::Message;
use sea_orm::DatabaseConnection;
use tonic::Status;

pub async fn handle(
    db: &DatabaseConnection,
    msg: SignedMessage,
) -> Result<ListIdentityFlagsResponse, Status> {
    let public_key = verify_signed_message(&msg)?;

    let body = Proto::ListIdentityFlagsBody::decode(&msg.message_bytes[..])
        .map_err(|_| {
            Status::invalid_argument("Argument is not a ListIdentityFlagsBody")
        })?;

    let skew_ms: i64 = 30 * 60 * 1000;
    if (body.timestamp - Utc::now().timestamp_millis()).abs() > skew_ms {
        return Err(Status::invalid_argument(
            "timestamp outside acceptable skew window",
        ));
    }

    let authorized = id_repo::Query::authorized_keys(db, &body.identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?
        .iter()
        .any(|k| {
            k.key.key_type == public_key.key_type && k.key.key == public_key.key
        });
    if !authorized {
        return Err(Status::permission_denied("not authorized"));
    }

    let flags = id_repo::Query::list_flags(db, &body.identity)
        .await
        .map_err(|_| Status::internal("internal server error"))?;

    Ok(ListIdentityFlagsResponse { flags })
}

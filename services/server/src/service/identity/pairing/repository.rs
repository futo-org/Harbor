use crate::service::proto as Proto;
use ::entity::{pairing_session_claimer_model, pairing_session_model};
use chrono::{DateTime, Duration, Utc};
use sea_orm::*;
use std::time::{SystemTime, UNIX_EPOCH};

pub const PAIRING_SESSION_TTL_SECONDS: i32 = 300;

/// Errors returned by pairing session repository operations.
pub enum PairingSessionQueryError {
    NotFound,
    Internal,
}

/// Returns true when a stored pairing session has expired.
pub fn is_pairing_session_expired(
    session: &pairing_session_model::Model,
) -> bool {
    Utc::now() >= session.expires_at
}

/// Repository entry points for pairing session persistence.
pub struct Query;

impl Query {
    /// Creates a fresh pairing session for `issuer_identity`.
    ///
    /// Before insert, performs cleanup in two steps:
    /// 1) deletes expired sessions globally, and
    /// 2) deletes any existing session for the same identity,
    ///    so each identity has at most one active session.
    pub async fn create_pairing_session(
        db: &DbConn,
        issuer_identity: &str,
        pairing_session_signature: &str,
        signed_by: &Proto::PublicKey,
        created_at: DateTime<Utc>,
        expires_at: DateTime<Utc>,
    ) -> Result<pairing_session_model::Model, PairingSessionQueryError> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
        let dt = DateTime::<Utc>::from_timestamp(
            now.as_secs() as i64,
            now.subsec_nanos(),
        )
        .ok_or(PairingSessionQueryError::Internal)?;

        let cutoff = dt
            .checked_sub_signed(Duration::seconds(
                PAIRING_SESSION_TTL_SECONDS as i64,
            ))
            .unwrap_or(dt);

        let _ = pairing_session_model::Entity::delete_many()
            .filter(pairing_session_model::Column::CreatedAt.lt(cutoff))
            .exec(db)
            .await;

        let _ = pairing_session_model::Entity::delete_many()
            .filter(
                pairing_session_model::Column::IssuerIdentity
                    .eq(issuer_identity),
            )
            .exec(db)
            .await;

        pairing_session_model::ActiveModel {
            pairing_session_signature: Set(
                pairing_session_signature.to_string()
            ),
            signed_by_key_type: Set(signed_by.key_type),
            signed_by_key: Set(signed_by.key.clone()),
            issuer_identity: Set(issuer_identity.to_string()),
            created_at: Set(created_at),
            expires_at: Set(expires_at),
        }
        .insert(db)
        .await
        .map_err(|_| PairingSessionQueryError::Internal)
    }

    /// Returns the pairing session row for `pairing_session_signature`.
    ///
    /// Fails with `PairingSessionQueryError::NotFound` when no session exists.
    pub async fn get_pairing_session(
        db: &DbConn,
        pairing_session_signature: &str,
    ) -> Result<pairing_session_model::Model, PairingSessionQueryError> {
        pairing_session_model::Entity::find_by_id(pairing_session_signature)
            .one(db)
            .await
            .map_err(|_| PairingSessionQueryError::Internal)?
            .ok_or(PairingSessionQueryError::NotFound)
    }

    /// Lists all claimers currently recorded for a pairing session signature.
    pub async fn list_claimer_pubkeys(
        db: &DbConn,
        pairing_session_signature: &str,
    ) -> Result<Vec<Proto::PublicKey>, PairingSessionQueryError> {
        let rows = pairing_session_claimer_model::Entity::find()
            .filter(
                pairing_session_claimer_model::Column::PairingSessionSignature
                    .eq(pairing_session_signature),
            )
            .all(db)
            .await
            .map_err(|_| PairingSessionQueryError::Internal)?;

        Ok(rows
            .into_iter()
            .map(|row| Proto::PublicKey {
                key_type: row.key_type,
                key: row.key,
            })
            .collect())
    }

    /// Deletes a specific pairing session by session signature.
    pub async fn delete_pairing_session(
        db: &DbConn,
        pairing_session_signature: &str,
    ) -> Result<(), PairingSessionQueryError> {
        pairing_session_model::Entity::delete_by_id(pairing_session_signature)
            .exec(db)
            .await
            .map(|_| ())
            .map_err(|_| PairingSessionQueryError::Internal)
    }

    /// Records a claimer public key for a pairing session signature.
    ///
    /// Duplicate `(signature, key_type, key)` entries are ignored.
    pub async fn add_claimer_pubkey(
        db: &DbConn,
        pairing_session_signature: &str,
        public_key: &Proto::PublicKey,
    ) -> Result<(), PairingSessionQueryError> {
        let row = pairing_session_claimer_model::ActiveModel {
            pairing_session_signature: Set(
                pairing_session_signature.to_string()
            ),
            key_type: Set(public_key.key_type),
            key: Set(public_key.key.clone()),
        };

        let res = pairing_session_claimer_model::Entity::insert(row)
            .on_conflict(
                sea_query::OnConflict::columns([
                    pairing_session_claimer_model::Column::PairingSessionSignature,
                    pairing_session_claimer_model::Column::KeyType,
                    pairing_session_claimer_model::Column::Key,
                ])
                .do_nothing()
                .to_owned(),
            )
            .exec(db)
            .await;

        match res {
            Ok(_) | Err(DbErr::RecordNotInserted) => Ok(()),
            Err(_) => Err(PairingSessionQueryError::Internal),
        }
    }
}

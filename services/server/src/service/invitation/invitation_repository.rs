use crate::service::proto as Proto;
use ::entity::{identity_invitation_claimer_model, identity_invitation_model};
use chrono::{DateTime, Duration, Utc};
use sea_orm::*;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_TTL_SECONDS: i32 = 300;

pub enum InvitationQueryError {
    NotFound,
    Internal,
}

pub fn is_invitation_expired(inv: &identity_invitation_model::Model) -> bool {
    let elapsed = Utc::now().signed_duration_since(inv.created_at);
    elapsed > Duration::seconds(inv.ttl_seconds as i64)
}

pub struct Query;

impl Query {
    pub async fn create_invitation(
        db: &DbConn,
        identity_key: &str,
        invite_code: &str,
    ) -> Result<identity_invitation_model::Model, InvitationQueryError> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
        let dt = DateTime::<Utc>::from_timestamp(
            now.as_secs() as i64,
            now.subsec_nanos(),
        )
        .ok_or(InvitationQueryError::Internal)?;

        let cutoff = dt
            .checked_sub_signed(Duration::seconds(DEFAULT_TTL_SECONDS as i64))
            .unwrap_or(dt);

        let _ = identity_invitation_model::Entity::delete_many()
            .filter(identity_invitation_model::Column::CreatedAt.lt(cutoff))
            .exec(db)
            .await;

        let _ = identity_invitation_model::Entity::delete_many()
            .filter(
                identity_invitation_model::Column::Identity.eq(identity_key),
            )
            .exec(db)
            .await;

        identity_invitation_model::ActiveModel {
            invite_code: Set(invite_code.to_string()),
            identity: Set(identity_key.to_string()),
            created_at: Set(dt),
            ttl_seconds: Set(DEFAULT_TTL_SECONDS),
        }
        .insert(db)
        .await
        .map_err(|_| InvitationQueryError::Internal)
    }

    pub async fn get_invitation(
        db: &DbConn,
        invite_code: &str,
    ) -> Result<identity_invitation_model::Model, InvitationQueryError> {
        identity_invitation_model::Entity::find_by_id(invite_code)
            .one(db)
            .await
            .map_err(|_| InvitationQueryError::Internal)?
            .ok_or(InvitationQueryError::NotFound)
    }

    pub async fn list_claimers(
        db: &DbConn,
        invite_code: &str,
    ) -> Result<Vec<Proto::PublicKey>, InvitationQueryError> {
        let rows = identity_invitation_claimer_model::Entity::find()
            .filter(
                identity_invitation_claimer_model::Column::InviteCode
                    .eq(invite_code),
            )
            .all(db)
            .await
            .map_err(|_| InvitationQueryError::Internal)?;

        Ok(rows
            .into_iter()
            .map(|row| Proto::PublicKey {
                key_type: row.key_type,
                key: row.key,
            })
            .collect())
    }

    pub async fn add_claimer(
        db: &DbConn,
        invite_code: &str,
        public_key: &Proto::PublicKey,
    ) -> Result<(), InvitationQueryError> {
        let row = identity_invitation_claimer_model::ActiveModel {
            invite_code: Set(invite_code.to_string()),
            key_type: Set(public_key.key_type),
            key: Set(public_key.key.clone()),
        };

        let res = identity_invitation_claimer_model::Entity::insert(row)
            .on_conflict(
                sea_query::OnConflict::columns([
                    identity_invitation_claimer_model::Column::InviteCode,
                    identity_invitation_claimer_model::Column::KeyType,
                    identity_invitation_claimer_model::Column::Key,
                ])
                .do_nothing()
                .to_owned(),
            )
            .exec(db)
            .await;

        match res {
            Ok(_) | Err(DbErr::RecordNotInserted) => Ok(()),
            Err(_) => Err(InvitationQueryError::Internal),
        }
    }
}

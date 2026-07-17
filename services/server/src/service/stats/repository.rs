use ::entity::reply_count_model as ReplyCountModel;
use sea_orm::sea_query::{Expr, ExprTrait, OnConflict};
use sea_orm::*;

use crate::service::events::TargetEventKey;

pub struct Mutation;

impl Mutation {
    /// For a new post event, create a row with a reply count of 0.
    pub async fn init_reply_count_for(
        db: &DbConn,
        key: TargetEventKey,
    ) -> Result<(), DbErr> {
        let result =
            ReplyCountModel::Entity::insert(ReplyCountModel::ActiveModel {
                event_key_collection: Set(key.collection),
                event_key_identity: Set(key.identity),
                event_key_public_key_type: Set(key.public_key_type),
                event_key_public_key: Set(key.public_key),
                event_key_sequence: Set(key.sequence),
                reply_count: Set(0),
            })
            .on_conflict(
                OnConflict::columns([
                    ReplyCountModel::Column::EventKeyCollection,
                    ReplyCountModel::Column::EventKeyIdentity,
                    ReplyCountModel::Column::EventKeyPublicKeyType,
                    ReplyCountModel::Column::EventKeyPublicKey,
                    ReplyCountModel::Column::EventKeySequence,
                ])
                .do_nothing()
                .to_owned(),
            )
            .exec(db)
            .await;

        match result {
            Ok(_) => Ok(()),
            Err(DbErr::RecordNotInserted) => Ok(()),
            Err(e) => Err(e),
        }
    }

    /// Increment the reply count for `key` or create a count of 1 if no
    /// counter exists for it.
    pub async fn count_reply_for(
        db: &DbConn,
        key: TargetEventKey,
    ) -> Result<(), DbErr> {
        // Try inserting a count of 1 if no count is present.
        ReplyCountModel::Entity::insert(ReplyCountModel::ActiveModel {
            event_key_collection: Set(key.collection),
            event_key_identity: Set(key.identity),
            event_key_public_key_type: Set(key.public_key_type),
            event_key_public_key: Set(key.public_key),
            event_key_sequence: Set(key.sequence),
            reply_count: Set(1),
        })
        // Increment the existing count if there is one.
        .on_conflict(
            OnConflict::columns([
                ReplyCountModel::Column::EventKeyCollection,
                ReplyCountModel::Column::EventKeyIdentity,
                ReplyCountModel::Column::EventKeyPublicKeyType,
                ReplyCountModel::Column::EventKeyPublicKey,
                ReplyCountModel::Column::EventKeySequence,
            ])
            .value(
                ReplyCountModel::Column::ReplyCount,
                Expr::col((
                    ReplyCountModel::Entity,
                    ReplyCountModel::Column::ReplyCount,
                ))
                .add(1),
            )
            .to_owned(),
        )
        .exec(db)
        .await?;

        Ok(())
    }

    /// Decrement the reply count for `key`, if it has a recorded reply count > 0.
    pub async fn remove_reply_for(
        db: &DbConn,
        key: TargetEventKey,
    ) -> Result<(), DbErr> {
        // Only decrement if the reply count is greater than zero.
        let filter =
            key_condition(key).add(ReplyCountModel::Column::ReplyCount.gt(0));

        ReplyCountModel::Entity::update_many()
            .col_expr(
                ReplyCountModel::Column::ReplyCount,
                Expr::col(ReplyCountModel::Column::ReplyCount).sub(1),
            )
            .filter(filter)
            .exec(db)
            .await?;

        Ok(())
    }
}

fn key_condition(key: TargetEventKey) -> Condition {
    Condition::all()
        .add(ReplyCountModel::Column::EventKeyCollection.eq(key.collection))
        .add(ReplyCountModel::Column::EventKeyIdentity.eq(key.identity))
        .add(
            ReplyCountModel::Column::EventKeyPublicKeyType
                .eq(key.public_key_type),
        )
        .add(ReplyCountModel::Column::EventKeyPublicKey.eq(key.public_key))
        .add(ReplyCountModel::Column::EventKeySequence.eq(key.sequence))
}

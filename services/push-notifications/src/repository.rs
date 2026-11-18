use crate::manager::PushService;
use polycentric_common::models::protos_v2::{PublicKey, PushTarget};
use push_notifications_entity::push_subscription_model as PushSubscriptionModel;
use sea_orm::sea_query::{Expr, ExprTrait};
use sea_orm::*;
use time::OffsetDateTime;

/// Query condition for whether a row's key is in `keys`.
fn key_in(keys: &[PublicKey]) -> sea_orm::sea_query::Expr {
    Expr::tuple([
        Expr::col(PushSubscriptionModel::Column::PublicKeyType),
        Expr::col(PushSubscriptionModel::Column::PublicKey),
    ])
    .in_tuples(keys.iter().map(|k| (k.key_type as i16, k.key.clone())))
}

pub struct Query;

impl Query {
    /// The distinct Expo tokens subscribed to `identity` by any of `keys`.
    /// `keys` should be the list of authorized keys for `identity`.
    pub async fn expo_tokens_for_identity(
        db: &DbConn,
        identity: &str,
        keys: &[PublicKey],
    ) -> Result<Vec<String>, DbErr> {
        if keys.is_empty() {
            return Ok(vec![]);
        }

        PushSubscriptionModel::Entity::find()
            .select_only()
            .column(PushSubscriptionModel::Column::Token)
            .distinct()
            .filter(PushSubscriptionModel::Column::Identity.eq(identity))
            .filter(PushSubscriptionModel::Column::Service.eq(PushService::Expo.as_ref()))
            .filter(key_in(keys))
            .into_tuple()
            .all(db)
            .await
    }
}

pub struct Mutation;

impl Mutation {
    /// Unregister any subscriptions for `target` or with a public key in
    /// `subscriptions`.
    /// Then, register all of the subscriptions in `subscription`.
    pub async fn replace_subscriptions(
        db: &DbConn,
        target: &PushTarget,
        subscriptions: &[(PublicKey, String)],
    ) -> Result<(), DbErr> {
        let txn = db.begin().await?;

        // Remove all subscriptions for `target`.
        PushSubscriptionModel::Entity::delete_many()
            .filter(PushSubscriptionModel::Column::Service.eq(&target.service))
            .filter(PushSubscriptionModel::Column::Token.eq(&target.token))
            .exec(&txn)
            .await?;

        if !subscriptions.is_empty() {
            // Gather public keys
            let mut signers: Vec<PublicKey> = vec![];
            for (signer, _) in subscriptions {
                if !signers.contains(signer) {
                    signers.push(signer.clone());
                }
            }

            // Delete existing subscriptions for each public key
            PushSubscriptionModel::Entity::delete_many()
                .filter(key_in(&signers))
                .exec(&txn)
                .await?;

            // Derive new subscriptions
            let now = OffsetDateTime::now_utc();
            let rows =
                subscriptions
                    .iter()
                    .map(|(signer, identity)| PushSubscriptionModel::ActiveModel {
                        public_key_type: Set(signer.key_type as i16),
                        public_key: Set(signer.key.clone()),
                        identity: Set(identity.clone()),
                        service: Set(target.service.clone()),
                        token: Set(target.token.clone()),
                        created_at: Set(now),
                        updated_at: Set(now),
                    });

            // Register new subscriptions
            PushSubscriptionModel::Entity::insert_many(rows)
                .on_conflict(
                    sea_query::OnConflict::columns([
                        PushSubscriptionModel::Column::PublicKeyType,
                        PushSubscriptionModel::Column::PublicKey,
                        PushSubscriptionModel::Column::Identity,
                    ])
                    .update_columns([
                        PushSubscriptionModel::Column::Service,
                        PushSubscriptionModel::Column::Token,
                        PushSubscriptionModel::Column::UpdatedAt,
                    ])
                    .to_owned(),
                )
                .exec_without_returning(&txn)
                .await?;
        }

        txn.commit().await
    }

    /// Unregister every subscription where the service is `service` and the
    /// token is in `tokens`.
    pub async fn remove_tokens(db: &DbConn, service: &str, tokens: &[String]) -> Result<(), DbErr> {
        if tokens.is_empty() {
            return Ok(());
        }

        PushSubscriptionModel::Entity::delete_many()
            .filter(PushSubscriptionModel::Column::Service.eq(service))
            .filter(PushSubscriptionModel::Column::Token.is_in(tokens))
            .exec(db)
            .await?;

        Ok(())
    }
}

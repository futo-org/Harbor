use ::entity::{event_model, notification};
use sea_orm_migration::prelude::*;

/// `notification_to_identity_id_idx`: `list_notifications` grabs the notifications
/// for an identity reverse sorted by the primary key.
///
/// `events_collection_created_at_id_idx`: feeds are sorted in reverse-chronological
/// order, with the primary key as a fallback to keep the sort order stable.
///
/// `events_identity_heads_idx`: `list_heads` gets only the head for each "event stream"
/// for efficient syncing.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("notification_to_identity_id_idx")
                    .table(notification::Entity)
                    .col(notification::Column::ToIdentity)
                    .col(notification::Column::Id)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("events_collection_created_at_id_idx")
                    .table(event_model::Entity)
                    .col(event_model::Column::Collection)
                    .col(event_model::Column::CreatedAt)
                    .col(event_model::Column::Id)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("events_identity_heads_idx")
                    .table(event_model::Entity)
                    .col(event_model::Column::Identity)
                    .col(event_model::Column::PublicKeyType)
                    .col(event_model::Column::PublicKey)
                    .col(event_model::Column::Collection)
                    .col(event_model::Column::Sequence)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("events_identity_heads_idx")
                    .table(event_model::Entity)
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("events_collection_created_at_id_idx")
                    .table(event_model::Entity)
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("notification_to_identity_id_idx")
                    .table(notification::Entity)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

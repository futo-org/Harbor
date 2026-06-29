use ::entity::{
    content_delete_model, content_label_model, content_reaction_model,
};
use sea_orm_migration::prelude::*;

/// `content_delete`, `content_reaction`, and `content_label` are all
/// queried to match events, but have no index over the `event_key_*`
/// columns (see `tombstone::list_tombstones_for_event_keys`). We add
/// an index so that matching events does not require a sequential scan.
///
/// Each index mirrors the column order of the existing
/// `idx-events-event_key` unique index on the `events` table
/// (collection, identity, public_key_type, public_key, sequence) but is
/// **non-unique** because a single target event can have multiple
/// delete / reaction / label rows.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("content_delete_event_key_idx")
                    .table(content_delete_model::Entity)
                    .col(content_delete_model::Column::EventKeyCollection)
                    .col(content_delete_model::Column::EventKeyIdentity)
                    .col(content_delete_model::Column::EventKeyPublicKeyType)
                    .col(content_delete_model::Column::EventKeyPublicKey)
                    .col(content_delete_model::Column::EventKeySequence)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("content_reaction_event_key_idx")
                    .table(content_reaction_model::Entity)
                    .col(content_reaction_model::Column::EventKeyCollection)
                    .col(content_reaction_model::Column::EventKeyIdentity)
                    .col(content_reaction_model::Column::EventKeyPublicKeyType)
                    .col(content_reaction_model::Column::EventKeyPublicKey)
                    .col(content_reaction_model::Column::EventKeySequence)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("content_label_event_key_idx")
                    .table(content_label_model::Entity)
                    .col(content_label_model::Column::EventKeyCollection)
                    .col(content_label_model::Column::EventKeyIdentity)
                    .col(content_label_model::Column::EventKeyPublicKeyType)
                    .col(content_label_model::Column::EventKeyPublicKey)
                    .col(content_label_model::Column::EventKeySequence)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("content_label_event_key_idx")
                    .table(content_label_model::Entity)
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("content_reaction_event_key_idx")
                    .table(content_reaction_model::Entity)
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("content_delete_event_key_idx")
                    .table(content_delete_model::Entity)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

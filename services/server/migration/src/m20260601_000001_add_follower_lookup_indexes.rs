use ::entity::{content_follow_model, event_model};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_index(
                Index::create()
                    .name("content_follow_identity_id_idx")
                    .table(content_follow_model::Entity)
                    .col(content_follow_model::Column::IdentityId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("events_content_digest_idx")
                    .table(event_model::Entity)
                    .col(event_model::Column::ContentDigestType)
                    .col(event_model::Column::ContentDigestBytes)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("events_content_digest_idx")
                    .table(event_model::Entity)
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("content_follow_identity_id_idx")
                    .table(content_follow_model::Entity)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

use ::entity::event;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const NAME: &str = "event_identity";

// Cache rows that point at a post, looked up when the post is deleted.
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_index({
                let mut i = Index::create();
                i.if_not_exists()
                    .name(NAME)
                    .table(event::Entity)
                    .col(event::Column::Identity);
                i
            })
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index({
                let mut i = Index::drop();
                i.if_exists().name(NAME).table(event::Entity);
                i
            })
            .await
    }
}

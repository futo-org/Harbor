use ::entity::content_post_model;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        crate::m20260720_164457_add_reaction_counters::Migration::down(
            manager,
        )?;
        crate::m20260707_191447_add_reply_counts_table::Migration::down(manager)
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        crate::m20260720_164457_add_reaction_counters::Migration::up(manager)?;
        crate::m20260707_191447_add_reply_counts_table::Migration::up(manager)
    }
}

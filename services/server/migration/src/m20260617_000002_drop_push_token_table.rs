//! Drops the orphaned `push_token` table. Push notifications moved to the
//! separate `notifications` service (which owns its own `push_token` table in
//! the `notifications` schema) in 40937b65, leaving the server's copy unused.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .if_exists()
                    .table(Alias::new("push_token"))
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // Re-creating the orphaned table on rollback serves no purpose.
        Ok(())
    }
}

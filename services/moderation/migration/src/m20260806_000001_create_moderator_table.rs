use sea_orm_migration::prelude::*;

/// Created the `moderator` table, which listed the identities whose
/// reports this service turned into labels. Moderators now label
/// directly and the server trusts its own `moderator` table, so a later
/// migration drops it again.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(DeriveIden)]
enum Moderator {
    Table,
    Identity,
    CreatedAt,
    UpdatedAt,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_table("moderator").await? {
            return Ok(());
        }

        manager
            .create_table(
                Table::create()
                    .table(Moderator::Table)
                    .col(
                        ColumnDef::new(Moderator::Identity)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(Moderator::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(Moderator::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().if_exists().table(Moderator::Table).to_owned())
            .await
    }
}

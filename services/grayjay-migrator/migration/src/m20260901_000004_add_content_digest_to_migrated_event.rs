use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(DeriveIden)]
enum MigratedEvent {
    Table,
    ContentDigestType,
    ContentDigestBytes,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager
            .has_column("migrated_event", "content_digest_type")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(MigratedEvent::Table)
                        .add_column(
                            ColumnDef::new(MigratedEvent::ContentDigestType)
                                .integer()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }
        if !manager
            .has_column("migrated_event", "content_digest_bytes")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(MigratedEvent::Table)
                        .add_column(
                            ColumnDef::new(MigratedEvent::ContentDigestBytes)
                                .binary()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(MigratedEvent::Table)
                    .drop_column(MigratedEvent::ContentDigestType)
                    .drop_column(MigratedEvent::ContentDigestBytes)
                    .to_owned(),
            )
            .await
    }
}

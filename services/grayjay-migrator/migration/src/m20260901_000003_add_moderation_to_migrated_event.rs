use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[derive(DeriveIden)]
enum MigratedEvent {
    Table,
    ModerationStatus,
    ModerationTags,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager
            .has_column("migrated_event", "moderation_status")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(MigratedEvent::Table)
                        .add_column(
                            ColumnDef::new(MigratedEvent::ModerationStatus)
                                .text()
                                .null(),
                        )
                        .to_owned(),
                )
                .await?;
        }
        if !manager
            .has_column("migrated_event", "moderation_tags")
            .await?
        {
            manager
                .alter_table(
                    Table::alter()
                        .table(MigratedEvent::Table)
                        .add_column(ColumnDef::new(MigratedEvent::ModerationTags).text().null())
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
                    .drop_column(MigratedEvent::ModerationStatus)
                    .drop_column(MigratedEvent::ModerationTags)
                    .to_owned(),
            )
            .await
    }
}

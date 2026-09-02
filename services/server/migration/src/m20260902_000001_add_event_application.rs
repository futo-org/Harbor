use ::entity::event_model;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

const COLUMNS: [event_model::Column; 4] = [
    event_model::Column::ApplicationName,
    event_model::Column::ApplicationId,
    event_model::Column::ApplicationVersion,
    event_model::Column::ApplicationUrl,
];

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_column("events", "application_name").await? {
            return Ok(());
        }
        let mut query = Table::alter();
        query.table(event_model::Entity);
        for column in COLUMNS {
            query.add_column(ColumnDef::new(column).text().null());
        }
        manager.alter_table(query).await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_column("events", "application_name").await? {
            return Ok(());
        }
        let mut query = Table::alter();
        query.table(event_model::Entity);
        for column in COLUMNS {
            query.drop_column(column);
        }
        manager.alter_table(query).await
    }
}

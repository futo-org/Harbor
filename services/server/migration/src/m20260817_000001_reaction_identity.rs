use entity::{event_model, reaction_model};
use sea_orm::ColumnTrait;

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager
            .has_column(
                reaction_model::Entity.unquoted(),
                reaction_model::Column::Identity.unquoted(),
            )
            .await?
        {
            return Ok(());
        }

        let tx = manager.get_connection();

        // Add the reaction.identity column, allowing nulls.
        let mut query = TableAlterStatement::new();
        query.table(reaction_model::Entity).add_column(
            ColumnDef::new_with_type(
                reaction_model::Column::Identity,
                reaction_model::Column::Identity
                    .def()
                    .get_column_type()
                    .clone(),
            )
            .text()
            .null(), // Set to not null once we've filled all rows.
        );
        tx.execute(&query).await?;

        // Fill the column.
        let mut query = UpdateStatement::new();
        query
            .table(reaction_model::Entity)
            .values([(
                reaction_model::Column::Identity,
                Expr::col(event_model::Column::Identity.as_column_ref()),
            )])
            .from(event_model::Entity)
            .cond_where(
                Expr::col(reaction_model::Column::EventId.as_column_ref())
                    .eq(Expr::col(event_model::Column::Id.as_column_ref())),
            );
        tx.execute(&query).await?;

        // Set column to not null.
        let mut query = TableAlterStatement::new();
        query.table(reaction_model::Entity).modify_column(
            ColumnDef::new_with_type(
                reaction_model::Column::Identity,
                reaction_model::Column::Identity
                    .def()
                    .get_column_type()
                    .clone(),
            )
            .text()
            .not_null(),
        );
        tx.execute(&query).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager
            .has_column(
                reaction_model::Entity.unquoted(),
                reaction_model::Column::Identity.unquoted(),
            )
            .await?
        {
            return Ok(());
        }

        // Add the reaction.identity column, allowing nulls.
        let mut query = TableAlterStatement::new();
        query
            .table(reaction_model::Entity)
            .drop_column(reaction_model::Column::Identity);
        manager.alter_table(query).await?;
        Ok(())
    }
}

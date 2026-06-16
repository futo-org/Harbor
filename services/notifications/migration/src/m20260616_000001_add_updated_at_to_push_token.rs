use notifications_entity::push_token_model as push_token;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_column("push_token", "updated_at").await? {
            return Ok(());
        }

        // Add the column nullable first so the existing rows are accepted.
        manager
            .alter_table(
                Table::alter()
                    .table(push_token::Entity)
                    .add_column(
                        ColumnDef::new(push_token::Column::UpdatedAt)
                            .date_time()
                            .null(),
                    )
                    .to_owned(),
            )
            .await?;

        // Backfill: a token's last-updated time starts as its creation time.
        let conn = manager.get_connection();
        let backfill = Query::update()
            .table(push_token::Entity)
            .value(
                push_token::Column::UpdatedAt,
                Expr::col(push_token::Column::CreatedAt),
            )
            .to_owned();
        conn.execute(&backfill).await?;

        // Now enforce NOT NULL to match the entity definition.
        manager
            .alter_table(
                Table::alter()
                    .table(push_token::Entity)
                    .modify_column(
                        ColumnDef::new(push_token::Column::UpdatedAt)
                            .date_time()
                            .not_null(),
                    )
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(push_token::Entity)
                    .drop_column(push_token::Column::UpdatedAt)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

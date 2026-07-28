use ::entity::content_identity_model;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager
            .has_column("content_identity", "rotation_keys")
            .await?
        {
            return Ok(());
        }
        manager
            .alter_table(
                Table::alter()
                    .table(content_identity_model::Entity)
                    .add_column(
                        ColumnDef::new(
                            content_identity_model::Column::RotationKeys,
                        )
                        .json_binary()
                        .not_null()
                        .default(Expr::cust("'[]'::jsonb")),
                    )
                    .add_column(
                        ColumnDef::new(
                            content_identity_model::Column::SigningKeys,
                        )
                        .json_binary()
                        .not_null()
                        .default(Expr::cust("'[]'::jsonb")),
                    )
                    .add_column(
                        ColumnDef::new(
                            content_identity_model::Column::RevocationBounds,
                        )
                        .json_binary()
                        .not_null()
                        .default(Expr::cust("'[]'::jsonb")),
                    )
                    .add_column(
                        ColumnDef::new(content_identity_model::Column::Servers)
                            .json_binary(),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager
            .has_column("content_identity", "rotation_keys")
            .await?
        {
            return Ok(());
        }
        manager
            .alter_table(
                Table::alter()
                    .table(content_identity_model::Entity)
                    .drop_column(content_identity_model::Column::RotationKeys)
                    .drop_column(content_identity_model::Column::SigningKeys)
                    .drop_column(
                        content_identity_model::Column::RevocationBounds,
                    )
                    .drop_column(content_identity_model::Column::Servers)
                    .to_owned(),
            )
            .await
    }
}

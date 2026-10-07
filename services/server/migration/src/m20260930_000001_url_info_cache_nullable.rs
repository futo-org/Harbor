use entity::url_info_cache;
use sea_orm_migration::prelude::*;

/// Makes the `title`, `description` and `image` columns nullable.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table({
                let mut alter = Table::alter();
                alter
                    .table(url_info_cache::Entity)
                    .modify_column(
                        ColumnDef::new(url_info_cache::Column::Title)
                            .text()
                            .null(),
                    )
                    .modify_column(
                        ColumnDef::new(url_info_cache::Column::Description)
                            .text()
                            .null(),
                    )
                    .modify_column(
                        ColumnDef::new(url_info_cache::Column::Image)
                            .text()
                            .null(),
                    );
                alter
            })
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table({
                let mut alter = Table::alter();
                alter
                    .table(url_info_cache::Entity)
                    .modify_column(
                        ColumnDef::new(url_info_cache::Column::Title)
                            .text()
                            .not_null(),
                    )
                    .modify_column(
                        ColumnDef::new(url_info_cache::Column::Description)
                            .text()
                            .not_null(),
                    )
                    .modify_column(
                        ColumnDef::new(url_info_cache::Column::Image)
                            .text()
                            .not_null(),
                    );
                alter
            })
            .await?;
        Ok(())
    }
}

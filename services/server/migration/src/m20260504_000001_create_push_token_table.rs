use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_table("push_token").await? {
            return Ok(());
        }
        manager
            .create_table(
                Table::create()
                    .table(Alias::new("push_token"))
                    .if_not_exists()
                    // Public key that registered this token (composite PK).
                    .col(small_integer(Alias::new("public_key_type")))
                    .col(binary(Alias::new("public_key")))
                    // Push service name and token.
                    .col(string(Alias::new("service")))
                    .col(string(Alias::new("token")))
                    .col(timestamp(Alias::new("created_at")))
                    .primary_key(
                        Index::create()
                            .col(Alias::new("public_key_type"))
                            .col(Alias::new("public_key")),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .if_exists()
                    .table(Alias::new("push_token"))
                    .to_owned(),
            )
            .await
    }
}

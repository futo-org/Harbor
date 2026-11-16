use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::ConnectionTrait;

/// Require an identity to be specified for each push notification subscription.
/// Existing data is not migrated.
#[derive(DeriveMigrationName)]
pub struct Migration;

const SERVICE_TOKEN_INDEX: &str = "idx_push_token_service_token";

#[derive(DeriveIden)]
enum PushToken {
    Table,
    PublicKeyType,
    PublicKey,
    Identity,
    Service,
    Token,
    CreatedAt,
    UpdatedAt,
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Wipe existing push registrations.
        manager
            .drop_table(Table::drop().table(PushToken::Table).if_exists().to_owned())
            .await?;

        // Create new schema.
        manager
            .create_table(
                Table::create()
                    .table(PushToken::Table)
                    .col(
                        ColumnDef::new(PushToken::PublicKeyType)
                            .small_integer()
                            .not_null(),
                    )
                    .col(ColumnDef::new(PushToken::PublicKey).binary().not_null())
                    .col(ColumnDef::new(PushToken::Identity).text().not_null())
                    .col(ColumnDef::new(PushToken::Service).text().not_null())
                    .col(ColumnDef::new(PushToken::Token).text().not_null())
                    .col(
                        ColumnDef::new(PushToken::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PushToken::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .primary_key(
                        Index::create()
                            .col(PushToken::PublicKeyType)
                            .col(PushToken::PublicKey)
                            .col(PushToken::Identity),
                    )
                    .to_owned(),
            )
            .await?;

        // Allow push targets to be unregistered efficiently.
        manager
            .create_index(
                Index::create()
                    .name(SERVICE_TOKEN_INDEX)
                    .table(PushToken::Table)
                    .col(PushToken::Service)
                    .col(PushToken::Token)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();

        // Wipe existing push registrations.
        conn.execute(&Query::delete().from_table(PushToken::Table).to_owned())
            .await?;

        // Remove the index.
        manager
            .drop_index(
                Index::drop()
                    .name(SERVICE_TOKEN_INDEX)
                    .table(PushToken::Table)
                    .to_owned(),
            )
            .await?;

        // Remove the identity column, along with the primary key.
        manager
            .alter_table(
                Table::alter()
                    .table(PushToken::Table)
                    .drop_column(PushToken::Identity)
                    .to_owned(),
            )
            .await?;

        // Add back a primary key.
        conn.execute_unprepared(
            r#"ALTER TABLE "push_token" ADD PRIMARY KEY ("public_key_type", "public_key")"#,
        )
        .await?;

        Ok(())
    }
}

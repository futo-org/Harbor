use sea_orm_migration::prelude::*;

/// Require an identity to be specified for each push notification subscription.
/// A new `push_subscription` table is used so that existing tokens in
/// `push_token` are not lost even though they cannot be migrated cleanly.
#[derive(DeriveMigrationName)]
pub struct Migration;

const SERVICE_TOKEN_INDEX: &str = "idx_push_subscription_service_token";

#[derive(DeriveIden)]
enum PushSubscription {
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
        manager
            .create_table(
                Table::create()
                    .table(PushSubscription::Table)
                    .col(
                        ColumnDef::new(PushSubscription::PublicKeyType)
                            .small_integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PushSubscription::PublicKey)
                            .binary()
                            .not_null(),
                    )
                    .col(ColumnDef::new(PushSubscription::Identity).text().not_null())
                    .col(ColumnDef::new(PushSubscription::Service).text().not_null())
                    .col(ColumnDef::new(PushSubscription::Token).text().not_null())
                    .col(
                        ColumnDef::new(PushSubscription::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(PushSubscription::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .primary_key(
                        Index::create()
                            .col(PushSubscription::PublicKeyType)
                            .col(PushSubscription::PublicKey)
                            .col(PushSubscription::Identity),
                    )
                    .to_owned(),
            )
            .await?;

        // Allow push targets to be unregistered efficiently.
        manager
            .create_index(
                Index::create()
                    .name(SERVICE_TOKEN_INDEX)
                    .table(PushSubscription::Table)
                    .col(PushSubscription::Service)
                    .col(PushSubscription::Token)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Dropping the table also drops its index.
        manager
            .drop_table(Table::drop().table(PushSubscription::Table).to_owned())
            .await?;

        Ok(())
    }
}

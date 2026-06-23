//! Creates the `notification` table. Columns are spelled out here (rather
//! than derived from the entity) so this migration is a fixed snapshot that
//! never drifts as `entity::notification` evolves. `IF NOT EXISTS` keeps it a
//! no-op on a database that already has the table.

use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

/// The five `EventKey` columns (collection, identity, signer, sequence)
/// stored inline for each referenced event, mirroring the other tables.
fn event_key_columns(table: &mut TableCreateStatement, prefix: &str) {
    table
        .col(small_integer(Alias::new(format!("{prefix}collection"))))
        .col(string(Alias::new(format!("{prefix}identity"))))
        .col(small_integer(Alias::new(format!(
            "{prefix}public_key_type"
        ))))
        .col(binary(Alias::new(format!("{prefix}public_key"))))
        .col(big_integer(Alias::new(format!("{prefix}sequence"))));
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.has_table("notification").await? {
            return Ok(());
        }

        let mut notification = Table::create();
        notification
            .table(Alias::new("notification"))
            .if_not_exists()
            .col(big_integer(Alias::new("id")).auto_increment().primary_key())
            // polycentric.v2.NotificationKind discriminant.
            .col(integer(Alias::new("kind")))
            .col(string(Alias::new("from_identity")))
            .col(string(Alias::new("to_identity")));
        event_key_columns(&mut notification, "trigger_event_key_");
        event_key_columns(&mut notification, "target_event_key_");
        notification
            .col(timestamp_with_time_zone(Alias::new("created_at")))
            .col(timestamp_with_time_zone(Alias::new("updated_at")));

        manager.create_table(notification.to_owned()).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .if_exists()
                    .table(Alias::new("notification"))
                    .to_owned(),
            )
            .await
    }
}

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::ConnectionTrait;

/// Convert the event/content timestamp columns from `timestamp without time
/// zone` (naive) to `timestamptz`, so stored instants are unambiguous UTC and
/// can't be reinterpreted in a reader's local timezone (issue #102).
///
/// Each conversion is guarded on the column's current type, so it is a no-op
/// where the column is already `timestamptz` and only rewrites legacy naive
/// columns on existing deployments. Existing naive values are stamped as UTC
/// via `AT TIME ZONE 'UTC'` rather than relying on the session timezone.
#[derive(DeriveMigrationName)]
pub struct Migration;

const COLUMNS: &[(&str, &str)] = &[
    ("events", "created_at"),
    ("events", "synced_at"),
    ("content", "synced_at"),
];

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        for (table, column) in COLUMNS {
            conn.execute_unprepared(&format!(
                r#"DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = '{table}' AND column_name = '{column}'
      AND table_schema = current_schema()
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "{table}"
      ALTER COLUMN "{column}" TYPE timestamptz USING "{column}" AT TIME ZONE 'UTC';
  END IF;
END $$;"#
            ))
            .await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        for (table, column) in COLUMNS {
            conn.execute_unprepared(&format!(
                r#"DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = '{table}' AND column_name = '{column}'
      AND table_schema = current_schema()
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "{table}"
      ALTER COLUMN "{column}" TYPE timestamp USING "{column}" AT TIME ZONE 'UTC';
  END IF;
END $$;"#
            ))
            .await?;
        }
        Ok(())
    }
}

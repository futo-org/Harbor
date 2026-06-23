use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::ConnectionTrait;

/// Convert `push_token.created_at` and `push_token.updated_at` from `timestamp
/// without time zone` (naive) to `timestamptz`, so stored instants are
/// unambiguous UTC and can't be reinterpreted in a reader's local timezone.
///
/// Each conversion is guarded on the column's current type so it is a no-op on
/// a fresh database (where the entity-derived `created_*` tables are already
/// `timestamptz`) and only rewrites legacy naive columns on existing
/// deployments. Existing naive values are stamped as UTC via `AT TIME ZONE
/// 'UTC'` rather than relying on the session timezone.
#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'push_token' AND column_name = 'created_at'
      AND table_schema = current_schema()
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "push_token"
      ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'push_token' AND column_name = 'updated_at'
      AND table_schema = current_schema()
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "push_token"
      ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'UTC';
  END IF;
END $$;"#,
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'push_token' AND column_name = 'created_at'
      AND table_schema = current_schema()
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "push_token"
      ALTER COLUMN "created_at" TYPE timestamp USING "created_at" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'push_token' AND column_name = 'updated_at'
      AND table_schema = current_schema()
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "push_token"
      ALTER COLUMN "updated_at" TYPE timestamp USING "updated_at" AT TIME ZONE 'UTC';
  END IF;
END $$;"#,
            )
            .await?;
        Ok(())
    }
}

//! Drop pg_search again.
//!
//! The community edition refuses to replay its WAL on standbys, which takes
//! down every replica of the cluster as soon as the index is created. The
//! migrations that set it up are no-ops now, this cleans up where they ran.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let tx = manager.get_connection();
        // The extension itself is owned by the cluster, not by the app role,
        // so it is dropped there once this index is gone.
        tx.execute_unprepared("DROP INDEX IF EXISTS content_post_search")
            .await?;
        reset_planner_warnings(tx).await
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Ok(())
    }
}

/// Only where the setting exists: resetting an unknown placeholder parameter
/// needs superuser once pg_search is no longer loaded.
pub(crate) async fn reset_planner_warnings(
    tx: &SchemaManagerConnection<'_>,
) -> Result<(), DbErr> {
    tx.execute_unprepared(
        r#"
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_db_role_setting s
                JOIN pg_database d ON d.oid = s.setdatabase
                WHERE d.datname = current_database()
                  AND s.setrole = 0
                  AND EXISTS (
                      SELECT 1 FROM unnest(s.setconfig) c
                      WHERE c LIKE 'paradedb.planner_warnings=%'
                  )
            ) THEN
                EXECUTE format(
                    'ALTER DATABASE %I RESET paradedb.planner_warnings',
                    current_database()
                );
            END IF;
        END
        $$
        "#,
    )
    .await?;
    Ok(())
}

//! Feed of "notifications changed for identity" events, shared across
//! server and worker processes through Postgres LISTEN/NOTIFY.

use std::sync::OnceLock;
use std::time::Duration;

use sea_orm::sqlx::postgres::{PgListener, PgPool};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DbBackend, DbErr, Statement,
};
use tokio::sync::broadcast;

const CHANNEL: &str = "notification_changed";

static CHANGES: OnceLock<broadcast::Sender<String>> = OnceLock::new();

/// Starts listening on `db`. Called once at server startup.
pub fn init(db: &DatabaseConnection) {
    let (tx, _) = broadcast::channel(1024);
    let pool = db.get_postgres_connection_pool().clone();
    let sender = tx.clone();
    tokio::spawn(listen(pool, sender));
    let _ = CHANGES.set(tx);
}

async fn listen(pool: PgPool, tx: broadcast::Sender<String>) {
    loop {
        match PgListener::connect_with(&pool).await {
            Ok(mut listener) => {
                if let Err(e) = listener.listen(CHANNEL).await {
                    tracing::warn!(error = %e, "notification listen failed");
                }
                while let Ok(notification) = listener.recv().await {
                    let _ = tx.send(notification.payload().to_owned());
                }
                tracing::warn!("notification listener disconnected");
            }
            Err(e) => {
                tracing::warn!(error = %e, "notification listener connect failed")
            }
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}

/// Identities whose notifications changed, from every process. `None`
/// before `init`.
pub fn subscribe() -> Option<broadcast::Receiver<String>> {
    CHANGES.get().map(|tx| tx.subscribe())
}

/// Announces that `identity`'s notifications changed.
pub async fn notify(
    db: &DatabaseConnection,
    identity: &str,
) -> Result<(), DbErr> {
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        "SELECT pg_notify($1, $2)",
        [CHANNEL.into(), identity.into()],
    ))
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm::{DbBackend, MockDatabase, MockExecResult};

    #[tokio::test]
    async fn notify_sends_the_identity_on_the_channel() {
        let db = MockDatabase::new(DbBackend::Postgres)
            .append_exec_results([MockExecResult {
                last_insert_id: 0,
                rows_affected: 1,
            }])
            .into_connection();

        notify(&db, "bob").await.unwrap();

        let sql = format!("{:?}", db.into_transaction_log());
        assert!(sql.contains("pg_notify"), "uses NOTIFY: {sql}");
        assert!(sql.contains(CHANNEL), "on the change channel: {sql}");
        assert!(sql.contains("\"bob\""), "with the identity: {sql}");
    }

    #[test]
    fn subscribe_is_none_before_init() {
        assert!(subscribe().is_none());
    }
}

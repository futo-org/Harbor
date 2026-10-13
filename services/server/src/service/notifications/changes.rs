//! Feed of "notifications changed" events, shared across server and worker
//! processes through Postgres LISTEN/NOTIFY.

use std::sync::{Arc, OnceLock};
use std::time::Duration;

use sea_orm::sqlx::postgres::{PgListener, PgPool};
use sea_orm::{
    ConnectionTrait, DatabaseConnection, DbBackend, DbErr, Statement,
};
use tokio::sync::broadcast;

const CHANNEL: &str = "notification_changed";

/// Postgres drops notifications sent while nobody listens, so `All`
/// follows every (re)connect of the listener.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Change {
    Identity(Arc<str>),
    All,
}

static CHANGES: OnceLock<broadcast::Sender<Change>> = OnceLock::new();

fn sender() -> &'static broadcast::Sender<Change> {
    CHANGES.get_or_init(|| broadcast::channel(1024).0)
}

/// Starts listening on `db`. Called once at server startup.
pub fn init(db: &DatabaseConnection) {
    let pool = db.get_postgres_connection_pool().clone();
    tokio::spawn(listen(pool, sender().clone()));
}

async fn listen(pool: PgPool, tx: broadcast::Sender<Change>) {
    loop {
        match connect(&pool).await {
            Ok(mut listener) => {
                let _ = tx.send(Change::All);
                loop {
                    match listener.try_recv().await {
                        Ok(Some(notification)) => {
                            let _ = tx.send(Change::Identity(
                                notification.payload().into(),
                            ));
                        }
                        // Reconnected underneath us: anything sent
                        // meanwhile is gone.
                        Ok(None) => {
                            let _ = tx.send(Change::All);
                        }
                        Err(e) => {
                            tracing::warn!(error = %e, "notification listener lost");
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "notification listener connect failed")
            }
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}

async fn connect(pool: &PgPool) -> Result<PgListener, sea_orm::sqlx::Error> {
    let mut listener = PgListener::connect_with(pool).await?;
    listener.listen(CHANNEL).await?;
    Ok(listener)
}

/// Changes from every process. Nothing arrives before `init`.
pub fn subscribe() -> broadcast::Receiver<Change> {
    sender().subscribe()
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
    use tokio::sync::broadcast::error::TryRecvError;

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
    fn subscribe_before_init_receives_nothing() {
        let mut rx = subscribe();
        assert_eq!(rx.try_recv(), Err(TryRecvError::Empty));
    }
}

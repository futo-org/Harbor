use tonic::Status;

pub mod client;

/// Read/write database connection.
pub(crate) type RwDbConn = DbConn;

/// Read-only database connection.
pub(crate) type RoDbConn = DbConn;

/// Database connection.
///
/// Prefer to use [`RwDbConn`] for queries that write and [`RoDbConn`] for
/// queries that only read.
pub(crate) struct DbConn(sqlx::pool::PoolConnection<sqlx::Postgres>);

impl DbConn {
    pub(crate) async fn from_pool(
        pool: &sea_orm::DatabaseConnection,
    ) -> Result<DbConn, Status> {
        let conn = pool
            .get_postgres_connection_pool()
            .acquire()
            .await
            .map_err(|err| {
                tracing::error!(
                    error = %err,
                    "failed to acquire database connection"
                );
                Status::unavailable("unavailable")
            })?;
        Ok(DbConn(conn))
    }
}

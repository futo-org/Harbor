use sea_orm::sea_query::Values;
use sea_orm::{
    ConnectionTrait, DbErr, ExecResult, QueryResult, RuntimeErr, Statement,
};
use sea_query_sqlx::SqlxValues;
use sqlx::Executor;
use tokio::sync::Mutex;
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
// NOTE: we should only use the connection for one request, so this mutex should
// never be contented, but its required for the ConnectionTrait implementation.
pub(crate) struct DbConn(Mutex<sqlx::pool::PoolConnection<sqlx::Postgres>>);

impl DbConn {
    /// Acquire a database connection from the `pool`.
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
        Ok(DbConn(Mutex::new(conn)))
    }

    /// Begin a transaction.
    pub(crate) async fn begin<'c>(
        &'c mut self,
    ) -> Result<DbTx<'c>, sqlx::Error> {
        use sqlx::Acquire;
        let tx = self.0.get_mut().begin().await?;
        Ok(DbTx(Mutex::new(tx)))
    }
}

#[async_trait::async_trait]
impl ConnectionTrait for DbConn {
    fn get_database_backend(&self) -> sea_orm::DbBackend {
        sea_orm::DbBackend::Postgres
    }

    async fn execute_raw(&self, stmt: Statement) -> Result<ExecResult, DbErr> {
        let query = sqlx_query(&stmt);
        let mut conn = self.0.lock().await;
        match query.execute(&mut **conn).await {
            Ok(res) => Ok(res.into()),
            Err(err) => Err(sqlx_error_to_exec_err(err)),
        }
    }

    async fn execute_unprepared(
        &self,
        sql: &str,
    ) -> Result<sea_orm::ExecResult, DbErr> {
        let mut conn = self.0.lock().await;
        match conn.execute(sqlx::AssertSqlSafe(sql.to_owned())).await {
            Ok(res) => Ok(res.into()),
            Err(err) => Err(sqlx_error_to_exec_err(err)),
        }
    }

    async fn query_one_raw(
        &self,
        stmt: Statement,
    ) -> Result<Option<QueryResult>, DbErr> {
        let query = sqlx_query(&stmt);
        let mut conn = self.0.lock().await;
        match query.fetch_one(&mut **conn).await {
            Ok(row) => Ok(Some(row.into())),
            Err(err) => match err {
                sqlx::Error::RowNotFound => Ok(None),
                _ => Err(sqlx_error_to_query_err(err)),
            },
        }
    }

    async fn query_all_raw(
        &self,
        stmt: Statement,
    ) -> Result<Vec<QueryResult>, DbErr> {
        let query = sqlx_query(&stmt);
        let mut conn = self.0.lock().await;
        match query.fetch_all(&mut **conn).await {
            Ok(rows) => Ok(rows.into_iter().map(|r| r.into()).collect()),
            Err(err) => Err(sqlx_error_to_query_err(err)),
        }
    }
}

/// Database transaction.
// NOTE: we should only use the connection for one request, so this mutex should
// never be contented, but its required for the ConnectionTrait implementation.
pub(crate) struct DbTx<'c>(Mutex<sqlx::Transaction<'c, sqlx::Postgres>>);

impl<'c> DbTx<'c> {
    /// Commits this transaction.
    pub(crate) async fn commit(self) -> Result<(), sqlx::Error> {
        self.0.into_inner().commit().await
    }

    /// Abort this transaction.
    pub(crate) async fn rollback(self) -> Result<(), sqlx::Error> {
        self.0.into_inner().rollback().await
    }
}

#[async_trait::async_trait]
impl<'c> ConnectionTrait for DbTx<'c> {
    fn get_database_backend(&self) -> sea_orm::DbBackend {
        sea_orm::DbBackend::Postgres
    }

    async fn execute_raw(&self, stmt: Statement) -> Result<ExecResult, DbErr> {
        let query = sqlx_query(&stmt);
        let mut conn = self.0.lock().await;
        match query.execute(&mut **conn).await {
            Ok(res) => Ok(res.into()),
            Err(err) => Err(sqlx_error_to_exec_err(err)),
        }
    }

    async fn execute_unprepared(
        &self,
        sql: &str,
    ) -> Result<sea_orm::ExecResult, DbErr> {
        let mut conn = self.0.lock().await;
        match conn.execute(sqlx::AssertSqlSafe(sql.to_owned())).await {
            Ok(res) => Ok(res.into()),
            Err(err) => Err(sqlx_error_to_exec_err(err)),
        }
    }

    async fn query_one_raw(
        &self,
        stmt: Statement,
    ) -> Result<Option<QueryResult>, DbErr> {
        let query = sqlx_query(&stmt);
        let mut conn = self.0.lock().await;
        match query.fetch_one(&mut **conn).await {
            Ok(row) => Ok(Some(row.into())),
            Err(err) => match err {
                sqlx::Error::RowNotFound => Ok(None),
                _ => Err(sqlx_error_to_query_err(err)),
            },
        }
    }

    async fn query_all_raw(
        &self,
        stmt: Statement,
    ) -> Result<Vec<QueryResult>, DbErr> {
        let query = sqlx_query(&stmt);
        let mut conn = self.0.lock().await;
        match query.fetch_all(&mut **conn).await {
            Ok(rows) => Ok(rows.into_iter().map(|r| r.into()).collect()),
            Err(err) => Err(sqlx_error_to_query_err(err)),
        }
    }
}

fn sqlx_query(
    stmt: &sea_orm::Statement,
) -> sqlx::query::Query<'_, sqlx::Postgres, SqlxValues> {
    let values = stmt
        .values
        .as_ref()
        .map_or(Values(Vec::new()), |values| values.clone());
    sqlx::query_with(sqlx::AssertSqlSafe(stmt.sql.as_str()), SqlxValues(values))
}

fn sqlx_error_to_exec_err(err: sqlx::Error) -> sea_orm::DbErr {
    DbErr::Exec(RuntimeErr::SqlxError(err.into()))
}

fn sqlx_error_to_query_err(err: sqlx::Error) -> DbErr {
    DbErr::Query(RuntimeErr::SqlxError(err.into()))
}

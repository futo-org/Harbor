use sea_orm::sea_query::Values;
use sea_orm::{
    ConnectionTrait, DbErr, ExecResult, QueryResult, RuntimeErr, Statement,
};
use sea_query_sqlx::SqlxValues;
use sqlx::Executor;
use tokio::sync::Mutex;
use tonic::Status;

pub mod client;

/// Database connection.
///
/// Prefer to use [`RwDbConn`] for queries that write and [`RoDbConn`] for
/// queries that only read.
// NOTE: we should only use the connection for one request, so this mutex should
// never be contented, but its required for the ConnectionTrait implementation.
pub(crate) struct DbConn(DbInner);

enum DbInner {
    // TODO: remove the Mutex once we use our own connection type through out
    // the code base and can remove the sea_orm::ConnectionTrait implementation.
    Sqlx(Mutex<sqlx::pool::PoolConnection<sqlx::Postgres>>),
    /// Mocked connection.
    ///
    /// Only used in internal tests.
    #[cfg(test)]
    Mock(std::sync::Arc<sea_orm::MockDatabaseConnection>),
}

impl DbConn {
    /// Acquire a database connection from the `pool`.
    pub(crate) async fn from_pool(
        pool: &sea_orm::DatabaseConnection,
    ) -> Result<DbConn, Status> {
        match &pool.inner {
            sea_orm::DatabaseConnectionType::SqlxPostgresPoolConnection(_) => {
                let pool = pool.get_postgres_connection_pool();
                let conn = pool.acquire().await.map_err(|err| {
                    tracing::error!(
                        error = %err,
                        "failed to acquire database connection"
                    );
                    Status::unavailable("unavailable")
                })?;
                Ok(DbConn(DbInner::Sqlx(Mutex::new(conn))))
            }
            #[cfg(test)]
            sea_orm::DatabaseConnectionType::MockDatabaseConnection(conn) => {
                Ok(DbConn(DbInner::Mock(conn.clone())))
            }
            sea_orm::DatabaseConnectionType::Disconnected => {
                tracing::error!("database pool disconnected");
                Err(Status::unavailable("unavailable"))
            }
            // We only use the mocked db connection for internal testing,
            // otherwise it shouldn't be used.
            #[allow(unused)]
            _ => unreachable!(),
        }
    }

    /// Begin a transaction.
    pub(crate) async fn begin<'c>(&'c mut self) -> Result<DbTx<'c>, DbErr> {
        match &mut self.0 {
            DbInner::Sqlx(conn) => {
                use sqlx::Acquire;
                let tx =
                    conn.get_mut().begin().await.map_err(into_seaorm_error)?;
                Ok(DbTx(Mutex::new(tx)))
            }
            #[cfg(test)]
            DbInner::Mock(_) => {
                panic!("mocked database transaction not implemented")
            }
        }
    }

    /// Return the connection to the pool.
    ///
    /// # Notes
    ///
    /// This happens asynchronously when the connection is dropped, this methods
    /// allows it to be done inline.
    pub(crate) async fn return_to_pool(self) {
        match self.0 {
            DbInner::Sqlx(conn) => conn.into_inner().return_to_pool().await,
            #[cfg(test)]
            DbInner::Mock(_) => {}
        }
    }
}

#[async_trait::async_trait]
impl ConnectionTrait for DbConn {
    fn get_database_backend(&self) -> sea_orm::DbBackend {
        sea_orm::DbBackend::Postgres
    }

    async fn execute_raw(&self, stmt: Statement) -> Result<ExecResult, DbErr> {
        match &self.0 {
            DbInner::Sqlx(conn) => {
                let query = sqlx_query(&stmt);
                let mut conn = conn.lock().await;
                match query.execute(&mut **conn).await {
                    Ok(res) => Ok(res.into()),
                    Err(err) => Err(into_seaorm_error(err)),
                }
            }
            #[cfg(test)]
            DbInner::Mock(conn) => conn.execute(stmt),
        }
    }

    async fn execute_unprepared(
        &self,
        sql: &str,
    ) -> Result<sea_orm::ExecResult, DbErr> {
        match &self.0 {
            DbInner::Sqlx(conn) => {
                let mut conn = conn.lock().await;
                match conn.execute(sqlx::AssertSqlSafe(sql.to_owned())).await {
                    Ok(res) => Ok(res.into()),
                    Err(err) => Err(into_seaorm_error(err)),
                }
            }
            #[cfg(test)]
            DbInner::Mock(conn) => {
                let db_backend = conn.get_database_backend();
                let stmt = Statement::from_string(db_backend, sql);
                conn.execute(stmt)
            }
        }
    }

    async fn query_one_raw(
        &self,
        stmt: Statement,
    ) -> Result<Option<QueryResult>, DbErr> {
        match &self.0 {
            DbInner::Sqlx(conn) => {
                let query = sqlx_query(&stmt);
                let mut conn = conn.lock().await;
                match query.fetch_one(&mut **conn).await {
                    Ok(row) => Ok(Some(row.into())),
                    Err(err) => match err {
                        sqlx::Error::RowNotFound => Ok(None),
                        _ => Err(into_seaorm_error(err)),
                    },
                }
            }
            #[cfg(test)]
            DbInner::Mock(conn) => conn.query_one(stmt),
        }
    }

    async fn query_all_raw(
        &self,
        stmt: Statement,
    ) -> Result<Vec<QueryResult>, DbErr> {
        match &self.0 {
            DbInner::Sqlx(conn) => {
                let query = sqlx_query(&stmt);
                let mut conn = conn.lock().await;
                match query.fetch_all(&mut **conn).await {
                    Ok(rows) => {
                        Ok(rows.into_iter().map(|r| r.into()).collect())
                    }
                    Err(err) => Err(into_seaorm_error(err)),
                }
            }
            #[cfg(test)]
            DbInner::Mock(conn) => conn.query_all(stmt),
        }
    }

    fn is_mock_connection(&self) -> bool {
        match &self.0 {
            DbInner::Sqlx(_) => false,
            #[cfg(test)]
            DbInner::Mock(_) => true,
        }
    }
}

/// Database transaction.
// NOTE: we should only use the connection for one request, so this mutex should
// never be contented, but its required for the ConnectionTrait implementation.
pub(crate) struct DbTx<'c>(Mutex<sqlx::Transaction<'c, sqlx::Postgres>>);

impl<'c> DbTx<'c> {
    /// Commits this transaction.
    pub(crate) async fn commit(self) -> Result<(), DbErr> {
        self.0
            .into_inner()
            .commit()
            .await
            .map_err(into_seaorm_error)
    }

    /// Commits this transaction and start another.
    pub(crate) async fn commit_and_chain(&mut self) -> Result<(), DbErr> {
        self.0
            .get_mut()
            .execute("COMMIT AND CHAIN")
            .await
            .map_err(into_seaorm_error)?;
        Ok(())
    }

    /// Abort this transaction.
    pub(crate) async fn rollback(self) -> Result<(), DbErr> {
        self.0
            .into_inner()
            .rollback()
            .await
            .map_err(into_seaorm_error)
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
            Err(err) => Err(into_seaorm_error(err)),
        }
    }

    async fn execute_unprepared(
        &self,
        sql: &str,
    ) -> Result<sea_orm::ExecResult, DbErr> {
        let mut conn = self.0.lock().await;
        match conn.execute(sqlx::AssertSqlSafe(sql.to_owned())).await {
            Ok(res) => Ok(res.into()),
            Err(err) => Err(into_seaorm_error(err)),
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
                _ => Err(into_seaorm_error(err)),
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
            Err(err) => Err(into_seaorm_error(err)),
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

fn into_seaorm_error(err: sqlx::Error) -> DbErr {
    DbErr::Query(RuntimeErr::SqlxError(err.into()))
}

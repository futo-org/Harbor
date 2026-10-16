pub mod client;

/// Read/write database connection.
pub(crate) type DbConn = sea_orm::DatabaseConnection;

/// Read-only database connection.
pub(crate) type RoDbConn = sea_orm::DatabaseConnection;

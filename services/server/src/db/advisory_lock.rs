//! Postgres advisory locks.

use sea_orm::DbErr;
use sea_orm::sea_query::{Expr, PgFunc, SelectStatement};
use sha2::{Digest, Sha256};

use crate::db::{Connection, DbTx};

/// Postgres lock.
///
/// All advisory locks share one key space, so every key is created here: the
/// kind in the high 32 bits and, for per-identity locks, a hash of the
/// identity in the low 32 bits.
pub(crate) struct AdvisoryLock(i64);

const GRAVITY: i64 = 1 << 32;
const BLOB_PRUNE: i64 = 2 << 32;
const IDENTITY_DOCUMENT: i64 = 3 << 32;

impl AdvisoryLock {
    pub(crate) const fn gravity() -> AdvisoryLock {
        AdvisoryLock(GRAVITY)
    }

    pub(crate) fn blob_prune() -> AdvisoryLock {
        AdvisoryLock(BLOB_PRUNE)
    }

    /// Lock for writes to `identity`'s document and event proofs.
    pub(crate) fn identity_document(identity: &str) -> AdvisoryLock {
        // Hashed here, not in Postgres, so every instance agrees on the key.
        let hash = Sha256::digest(identity.as_bytes());
        let hash = u32::from_be_bytes([hash[0], hash[1], hash[2], hash[3]]);
        AdvisoryLock(IDENTITY_DOCUMENT | i64::from(hash))
    }

    /// Try to lock the key until the transaction ends, without waiting.
    ///
    /// In production/staging we run multiple instances of the server
    /// simultaneously, this means the varios cron jobs are run concurrently.
    /// For some jobs that's fine, but for others it's a problem or even just
    /// wasteful.
    ///
    /// To prevent concurrent jobs doing the same things we use Postgres
    /// advisory locks. We lock a key, and as long as all keys are created using
    /// the same method, we can ensure that only a single job of the same kind
    /// runs concurrently.
    ///
    /// We could use row level locking as well, but then we lock all out all
    /// other users of the rows, which is not ideal for rows that are accessed a
    /// lot (especially if it's not needed).
    pub(crate) async fn try_lock(
        self,
        tx: &mut DbTx<'_>,
    ) -> Result<bool, DbErr> {
        let mut query = SelectStatement::new();
        query.expr(PgFunc::try_advisory_xact_lock(Expr::Constant(
            self.0.into(),
        )));
        if tx
            .query_one(&query)
            .await?
            .map_or(Ok(false), |r| r.try_get_by(0))?
        {
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Lock the key until the transaction ends, waiting for it if needed.
    pub(crate) async fn lock(self, tx: &mut DbTx<'_>) -> Result<(), DbErr> {
        let mut query = SelectStatement::new();
        query.expr(PgFunc::advisory_xact_lock(Expr::Constant(self.0.into())));
        tx.execute(&query).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_document_keys_stay_in_their_kind() {
        for identity in ["", "a", "did:example:alice"] {
            let key = AdvisoryLock::identity_document(identity).0;
            assert_eq!(key >> 32, IDENTITY_DOCUMENT >> 32);
        }
        assert_ne!(
            AdvisoryLock::identity_document("a").0,
            AdvisoryLock::identity_document("b").0,
        );
    }
}

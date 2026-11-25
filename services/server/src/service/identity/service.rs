//! Helpers for fetching identity-related events that hydrate
//! feed/list/thread responses. Split into per-data-source functions
//! so the pipeline's hydrate stage can fan them out in parallel.

use std::time::{Duration, Instant};

use polycentric_common::models::collections;
use sea_orm::{DbErr, RuntimeErr};
use tonic::Status;

use crate::data::EventWithContentRow;
use crate::db::{Connection, DbConn};
use crate::service::content::content_filestore::ContentFilestore;
use crate::service::context::RequestContext;
use crate::service::events::TargetEventKey;
use crate::service::feeds::repository::{self as FeedsRepository};
use crate::service::identity::repository::{
    Erased, Mutation as IdentityMutation, Query as IdentityRepo,
};
use crate::service::proto::{ContentDigest, Identity, PublicKey};

/// Events erased per transaction. Keeps each transaction short so a deadlock
/// with the tally cron or a worker only costs one batch.
const ERASE_BATCH: u64 = 100;

/// Erases an identity's events, deletes blobs nothing references any more,
/// and deletes its identity document. Used by bans and the operator command.
pub async fn erase_identity(
    db: &mut DbConn,
    filestore: Option<&ContentFilestore>,
    identity: &str,
) -> Result<Erased, DbErr> {
    let mut total = Erased::default();
    loop {
        let started = Instant::now();
        let mut run = async || {
            let mut tx = db.begin().await?;
            let batch = IdentityMutation::erase_events_batch(
                &mut tx,
                identity,
                ERASE_BATCH,
            )
            .await?;
            tx.commit().await?;
            Ok(batch)
        };
        let batch = retry_deadlocks_inline!(run);

        delete_blobs(filestore, &batch.blobs).await;
        total.events += batch.erased.events;
        total.content += batch.erased.content;
        total.blobs += batch.erased.blobs;
        tracing::info!(
            identity,
            events = total.events,
            content = total.content,
            blobs = total.blobs,
            batch_ms = started.elapsed().as_millis(),
            "erased batch"
        );

        if batch.erased.events < ERASE_BATCH {
            break;
        }
    }

    let mut run = async || {
        let mut txn = db.begin().await?;
        IdentityMutation::erase_derived(&mut txn, &[identity.to_string()])
            .await?;
        IdentityMutation::delete_identity_document(&mut txn, identity).await?;
        txn.commit().await
    };
    retry_deadlocks_inline!(run);
    Ok(total)
}

/// Erases one event and the content only it used. Blobs are left, as with
/// bans.
pub async fn erase_event(
    db: &mut DbConn,
    key: &TargetEventKey,
) -> Result<Erased, DbErr> {
    let mut run = async || {
        let mut tx = db.begin().await?;
        let batch = IdentityMutation::erase_event(&mut tx, key).await?;
        if key.collection as i32 == collections::IDENTITY {
            IdentityMutation::rebuild_identity_document(&mut tx, &key.identity)
                .await?;
        }
        tx.commit().await?;
        Ok(batch)
    };
    let batch = retry_deadlocks_inline!(run);
    Ok(batch.erased)
}

/// Erases every event `public_key` signed and the rows derived from
/// `identities` (the ones it signed for), in one transaction. For the
/// operator command.
pub async fn erase_signed_by(
    db: &mut DbConn,
    filestore: Option<&ContentFilestore>,
    public_key: &[u8],
    identities: &[String],
) -> Result<Erased, DbErr> {
    let batch = retry_deadlocks(async || {
        let mut tx = db.begin().await?;
        let batch =
            IdentityMutation::erase_events_signed_by(&mut tx, public_key)
                .await?;
        IdentityMutation::erase_derived(&mut tx, identities).await?;
        for identity in identities {
            IdentityMutation::rebuild_identity_document(&mut tx, identity)
                .await?;
        }
        tx.commit().await?;
        Ok(batch)
    })
    .await?;
    delete_blobs(filestore, &batch.blobs).await;
    Ok(batch.erased)
}

/// Deletes content rows no event references, and their blob bodies.
pub async fn prune_content(
    db: &mut DbConn,
    filestore: Option<&ContentFilestore>,
) -> Result<Erased, DbErr> {
    let (content, blobs) = retry_deadlocks(async || {
        let mut tx = db.begin().await?;
        let pruned = IdentityMutation::prune_orphan_content(&mut tx).await?;
        tx.commit().await?;
        Ok(pruned)
    })
    .await?;

    delete_blobs(filestore, &blobs).await;
    Ok(Erased {
        content,
        blobs: blobs.len() as u64,
        ..Erased::default()
    })
}

const DEADLOCK_RETRIES: u32 = 5;

/// Reruns `run` when Postgres aborts it as a deadlock victim. The erase
/// contends with the tally cron and workers, which lock rows in another
/// order.
async fn retry_deadlocks<T, F>(mut run: F) -> Result<T, DbErr>
where
    F: AsyncFnMut() -> Result<T, DbErr>,
{
    let mut attempt = 0;
    loop {
        match run().await {
            Err(err) if attempt < DEADLOCK_RETRIES && is_deadlock(&err) => {
                attempt += 1;
                tracing::warn!(attempt, "deadlock detected, retrying");
                tokio::time::sleep(Duration::from_secs(u64::from(attempt)))
                    .await;
            }
            result => return result,
        }
    }
}

/// Version of the `retry_deadlocks` function to work around a highe-ranked
/// lifetime error:
///
/// ```log
/// error: higher-ranked lifetime error
///   --> services/server/src/service/identity/rpc.rs:49:5
///    |
/// 49 |     async fn set_ban_status(
///    |     ^^^^^
///    |
///    = note: could not prove `Pin<Box<{async block@services/server/src/service/identity/rpc.rs:49:5: 49:10}>>: CoerceUnsized<Pin<Box<dyn Future<Output = std::result::Result<tonic::Response<polycentric_common::models::protos_v2::SetBanStatusResponse>, tonic::Status>> + Send>>>`
/// ```
macro_rules! retry_deadlocks_inline {
    ($run: ident) => {{
        let mut attempt = 0;
        loop {
            match $run().await {
                Ok(ok) => break ok,
                Err(err) if attempt < DEADLOCK_RETRIES && is_deadlock(&err) => {
                    attempt += 1;
                    tracing::warn!(attempt, "deadlock detected, retrying");
                    tokio::time::sleep(Duration::from_secs(u64::from(attempt)))
                        .await;
                }
                Err(err) => return Err(err),
            }
        }
    }};
}

use retry_deadlocks_inline;

fn is_deadlock(err: &DbErr) -> bool {
    let (DbErr::Exec(RuntimeErr::SqlxError(err))
    | DbErr::Query(RuntimeErr::SqlxError(err))) = err
    else {
        return false;
    };
    err.as_database_error()
        .and_then(|err| err.code())
        .is_some_and(|code| code == "40P01" || code == "40001")
}

async fn delete_blobs(
    filestore: Option<&ContentFilestore>,
    blobs: &[ContentDigest],
) {
    let Some(filestore) = filestore else { return };
    for digest in blobs {
        if let Err(error) = filestore.delete_blob(digest).await {
            tracing::warn!(
                %error,
                digest = hex::encode(&digest.value),
                "failed to delete blob"
            );
        }
    }
}

/// The identity-chain and profile events for `identities`. Fetched
/// sequentially so MockDatabase-backed tests stay deterministic; skips the
/// lookups entirely for an empty list.
pub async fn list_identity_and_profile_events<A>(
    ctx: &mut RequestContext<A>,
    identities: Vec<String>,
) -> Result<(Vec<EventWithContentRow>, Vec<EventWithContentRow>), Status> {
    if identities.is_empty() {
        return Ok((Vec::new(), Vec::new()));
    }
    let identity_events = list_identity_events(ctx, identities.clone()).await?;
    let profile_events = list_profile_events(ctx, identities).await?;
    Ok((identity_events, profile_events))
}

/// Fetch the latest identity events (rotation/signing key chain) for
/// each identity in `identities`.
pub async fn list_identity_events<A>(
    ctx: &mut RequestContext<A>,
    identities: Vec<String>,
) -> Result<Vec<EventWithContentRow>, Status> {
    IdentityRepo::list_identity_events_for_identities(&mut ctx.db, identities)
        .await
        .map_err(map_db_err)
}

/// Fetch the latest profile event (display name, avatar, banner)
/// for each identity in `identities`.
pub async fn list_profile_events<A>(
    ctx: &mut RequestContext<A>,
    identities: Vec<String>,
) -> Result<Vec<EventWithContentRow>, Status> {
    FeedsRepository::Query::list_latest_profiles_for_identities(
        &mut ctx.db,
        identities,
    )
    .await
    .map_err(map_db_err)
}

fn map_db_err(e: sea_orm::DbErr) -> Status {
    tracing::error!(error = %e, "identity hints db error");
    Status::internal("internal server error")
}

/// The latest valid identity document for `identity`.
pub async fn identity_content<C: Connection>(
    db: &mut C,
    identity: &str,
) -> Result<Identity, Status> {
    IdentityRepo::latest_valid_identity_content(db, identity)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "identity content db error");
            Status::internal("internal server error")
        })?
        .ok_or_else(|| {
            Status::failed_precondition(
                "no identity content for target — sync identity events first",
            )
        })
}

/// Verify that `signer` is permitted to sign an event in
/// `(target_identity, collection)`.
///
/// TODO: share this rule set with `rs-core::client::validate_event`.
pub async fn authorize_event_signer<C: Connection>(
    db: &mut C,
    target_identity: &str,
    signer: &PublicKey,
    collection: i32,
    signature: &[u8],
) -> Result<(), Status> {
    let identity_content = identity_content(db, target_identity).await?;

    if identity_content.authorizes_signer(signer) {
        return Ok(());
    }

    if identity_content
        .revocation_target_for(signer, collection)
        .is_none()
    {
        return Err(Status::permission_denied(
            "signer is revoked or not authorized by target identity",
        ));
    }

    // Events within the committed bound have a stored proof.
    let within_bound = IdentityRepo::has_event_proof(db, signature)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "authorize_event_signer proof error");
            Status::internal("internal server error")
        })?;
    if !within_bound {
        return Err(Status::permission_denied(
            "signer revoked and signature is not within the committed bound",
        ));
    }

    Ok(())
}

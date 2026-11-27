//! Operator commands.

use std::cmp::min;
use std::time::Duration;

use crate::config;
use crate::cron::{Cron, blob_index, blob_prune, identity_prune};
use crate::db::DbConn;
use crate::db::client::build_db_clients;
use crate::service::content::content_filestore::{
    ContentFilestore, ContentFilestoreConfig,
};
use crate::service::identity::repository::Query;
use crate::service::identity::service as identity_service;
use crate::service::proofs::cache::ProofCache;

pub const USAGE: &str = "usage: server delete-events (--identity <hex> | --public-key <hex>) [--yes]
       server prune-content [--yes]
       server sync-blob-index
       server prune-blobs [--dry-run] [--grace-period-secs <secs>]
       server prune-identities [--dry-run] [--grace-period-secs <secs>]";

pub async fn delete_events(args: Vec<String>) {
    let mut identity = None;
    let mut public_key = None;
    let mut yes = false;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--identity" => identity = args.next(),
            "--public-key" => public_key = args.next(),
            "--yes" => yes = true,
            _ => usage_error(&format!("unexpected argument: {arg}")),
        }
    }
    let mut db = connect().await;
    let (identities, count, public_key) = match (identity, public_key) {
        (Some(identity), None) => {
            let count = Query::count_events(&mut db, &identity)
                .await
                .expect("failed to count events");
            (vec![identity], count, None)
        }
        (None, Some(key)) => {
            let key = hex::decode(key)
                .unwrap_or_else(|_| usage_error("--public-key must be hex"));
            let counts = Query::identities_signed_by(&mut db, &key)
                .await
                .expect("failed to find identities");
            let count = counts.iter().map(|(_, n)| *n as u64).sum();
            let identities = counts.into_iter().map(|(i, _)| i).collect();
            (identities, count, Some(key))
        }
        _ => usage_error("pass exactly one of --identity or --public-key"),
    };
    if !yes {
        println!(
            "{count} events across {} identities would be deleted; add --yes to delete them",
            identities.len()
        );
        return;
    }

    let filestore = filestore().await;
    let total = match public_key {
        Some(key) => identity_service::erase_signed_by(
            &mut db,
            filestore.as_ref(),
            &key,
            &identities,
        )
        .await
        .expect("failed to delete events"),
        None => identity_service::erase_identity(
            &mut db,
            filestore.as_ref(),
            None,
            &identities[0],
            identity_service::PerformedBy::AdminCli,
            !yes, /* Dry run. */
        )
        .await
        .expect("failed to delete events"),
    };
    println!(
        "deleted {} events, {} orphaned content rows and {} blobs across {} identities",
        total.events,
        total.content,
        total.blobs,
        identities.len()
    );
}

pub async fn prune_content(args: Vec<String>) {
    let yes = match args.as_slice() {
        [] => false,
        [flag] if flag == "--yes" => true,
        _ => usage_error("unexpected arguments"),
    };

    let mut db = connect().await;
    if !yes {
        let count = Query::count_orphan_content(&mut db)
            .await
            .expect("failed to count orphaned content");
        println!(
            "{count} content rows would be deleted; add --yes to delete them"
        );
        return;
    }

    let filestore = filestore().await;
    let pruned = identity_service::prune_content(&mut db, filestore.as_ref())
        .await
        .expect("failed to prune content");
    println!(
        "deleted {} orphaned content rows and {} blobs",
        pruned.content, pruned.blobs
    );
}

pub async fn sync_blob_index(_: Vec<String>) {
    let mut db = connect().await;
    let Some(filestore) = filestore().await else {
        return;
    };

    if let Err(err) = blob_index::sync(&mut db, &filestore).await {
        eprintln!("failed to sync blob index: {err}");
    }
}

pub async fn blob_prune(args: Vec<String>) {
    let mut grace_period = config::get().blob_prune_grace;
    let mut dry_run = false;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match &*arg {
            "--dry-run" => dry_run = true,
            "--grace-period-secs" => {
                if let Some(arg) = args.next() {
                    match arg.parse() {
                        Ok(value) => grace_period = Duration::from_secs(value),
                        Err(err) => {
                            eprintln!(
                                "failed to parse argument to --grace-period: {err}"
                            );
                            return;
                        }
                    }
                } else {
                    eprintln!("missing argument to --grace-period");
                    return;
                }
            }
            arg => {
                eprintln!("unexpected argument '{arg}'");
                return;
            }
        }
    }

    let mut db = connect().await;
    let Some(filestore) = filestore().await else {
        return;
    };

    if let Err(()) =
        blob_prune::run(&mut db, &filestore, grace_period, dry_run).await
    {
        eprintln!("failed to sync blob index (see error logs above)");
    }
}

pub async fn identities_prune(args: Vec<String>) {
    let mut grace_period = config::get().blob_prune_grace;
    let mut dry_run = false;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match &*arg {
            "--dry-run" => dry_run = true,
            "--grace-period-secs" => {
                if let Some(arg) = args.next() {
                    match arg.parse() {
                        Ok(value) => grace_period = Duration::from_secs(value),
                        Err(err) => {
                            eprintln!(
                                "failed to parse argument to --grace-period: {err}"
                            );
                            return;
                        }
                    }
                } else {
                    eprintln!("missing argument to --grace-period");
                    return;
                }
            }
            arg => {
                eprintln!("unexpected argument '{arg}'");
                return;
            }
        }
    }

    let cron = Cron::new();
    let pool = db_pool().await;
    let Some(filestore) = filestore().await else {
        return;
    };
    identity_prune::run(
        &cron,
        pool,
        filestore,
        ProofCache::new(),
        grace_period,
        min(config::get().database_max_connections as usize, 50),
        dry_run,
    )
    .await;
    cron.close_and_wait().await;
}

async fn db_pool() -> sea_orm::DatabaseConnection {
    build_db_clients(true, None, None)
        .await
        .expect("failed to connect to database")
        .0
}

/// No statement timeout: finding a key's identities scans every event.
async fn connect() -> DbConn {
    let pool = db_pool().await;
    DbConn::from_pool(&pool)
        .await
        .expect("failed to connect to database")
}

async fn filestore() -> Option<ContentFilestore> {
    match ContentFilestoreConfig::from_env() {
        Ok(cfg) => Some(ContentFilestore::new(cfg).await),
        Err(error) => {
            eprintln!("object store not configured, leaving blobs: {error}");
            None
        }
    }
}

fn usage_error(message: &str) -> ! {
    eprintln!("{message}\n{USAGE}");
    std::process::exit(2);
}

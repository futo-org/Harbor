//! Operator commands. Without `--yes` they only report what would change.

use crate::db::client::build_db_clients;
use crate::service::content::content_filestore::{
    ContentFilestore, ContentFilestoreConfig,
};
use crate::service::identity::repository::{EventsSelector, Query};
use crate::service::identity::service as identity_service;
use sea_orm::DatabaseConnection;

pub const USAGE: &str = "usage: server delete-events (--identity <hex> | --public-key <hex>) [--yes]
       server prune-content [--yes]";

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
    let key_bytes;
    let selector = match (identity.as_deref(), public_key.as_deref()) {
        (Some(identity), None) => EventsSelector::Identity(identity),
        (None, Some(key)) => {
            key_bytes = hex::decode(key)
                .unwrap_or_else(|_| usage_error("--public-key must be hex"));
            EventsSelector::PublicKey(&key_bytes)
        }
        _ => usage_error("pass exactly one of --identity or --public-key"),
    };

    let db = connect().await;
    let count = Query::count_events(&db, &selector)
        .await
        .expect("failed to count events");
    if !yes {
        println!("{count} events would be deleted; add --yes to delete them");
        return;
    }

    let filestore = filestore().await;
    let erased = identity_service::erase_events(
        &db,
        filestore.as_ref(),
        None,
        &selector,
    )
    .await
    .expect("failed to delete events");
    println!(
        "deleted {} events, {} orphaned content rows and {} blobs",
        erased.events, erased.content, erased.blobs
    );
}

pub async fn prune_content(args: Vec<String>) {
    let yes = match args.as_slice() {
        [] => false,
        [flag] if flag == "--yes" => true,
        _ => usage_error("unexpected arguments"),
    };

    let db = connect().await;
    if !yes {
        let count = Query::count_orphan_content(&db)
            .await
            .expect("failed to count orphaned content");
        println!(
            "{count} content rows would be deleted; add --yes to delete them"
        );
        return;
    }

    let filestore = filestore().await;
    let pruned = identity_service::prune_content(&db, filestore.as_ref())
        .await
        .expect("failed to prune content");
    println!(
        "deleted {} orphaned content rows and {} blobs",
        pruned.content, pruned.blobs
    );
}

async fn connect() -> DatabaseConnection {
    build_db_clients(true)
        .await
        .expect("failed to connect to database")
        .0
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

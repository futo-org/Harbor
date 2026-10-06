//! `seed-moderation`: pre-seed the Harbor moderation service's
//! `processed_content` so it does not re-score already-moderated migrated posts.
//!
//! The moderation worker keys on the v2 content digest: if `processed_content`
//! already has a row with an `azure_response`, it skips Azure/PhotoDNA and
//! re-derives the labels from that JSON. We reconstruct an Azure-shaped response
//! from the legacy `(category, level)` tags (which are the same categories) and
//! upsert one `SUCCESS` row per migrated post that carried a verdict.
//!
//! Reads from the migrator's own `migrated_event` table (populated by a prior
//! migrate/dry-run) and writes to the moderation database configured via
//! `POLYCENTRIC_GRAYJAY_MIGRATOR_MODERATION_DATABASE_URL`. Run it before the
//! real (pushing) migrate so the rows exist before the worker sees the events.

use indicatif::{ProgressBar, ProgressDrawTarget, ProgressStyle};
use moderation_entity::processed_content_model as pc;
use sea_orm::sea_query::OnConflict;
use sea_orm::{ActiveValue::Set, ConnectOptions, Database, DatabaseConnection, EntityTrait};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io::IsTerminal;
use time::OffsetDateTime;
use tracing::info;

#[derive(Deserialize)]
struct Tag {
    name: String,
    level: i64,
}

/// Map a legacy tag category to its Azure Content Safety category name.
fn azure_category(name: &str) -> Option<&'static str> {
    match name {
        "hate" => Some("Hate"),
        "self_harm" => Some("SelfHarm"),
        "sexual" => Some("Sexual"),
        "violence" => Some("Violence"),
        _ => None,
    }
}

/// Reconstruct an Azure-shaped response the moderation worker can derive labels
/// from, out of the legacy JSON tags (`[{name,level}]`).
fn azure_response(tags_json: Option<&str>) -> Value {
    let tags: Vec<Tag> = tags_json
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let categories: Vec<Value> = tags
        .iter()
        .filter_map(|t| {
            azure_category(&t.name).map(|c| json!({"category": c, "severity": t.level}))
        })
        .collect();
    json!({ "text": { "categoriesAnalysis": categories }, "images": [] })
}

async fn connect_moderation(url: &str, schema: &str) -> Result<DatabaseConnection, String> {
    let mut opt = ConnectOptions::new(url.to_string());
    opt.set_schema_search_path(schema);
    opt.sqlx_logging(false);
    Database::connect(opt)
        .await
        .map_err(|e| format!("connect moderation db: {e}"))
}

/// Run the seed step.
pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cfg = crate::config::get();
    let url = cfg.moderation_database_url.as_deref().ok_or(
        "POLYCENTRIC_GRAYJAY_MIGRATOR_MODERATION_DATABASE_URL is required for seed-moderation",
    )?;

    info!("connecting to migrator database");
    let db = crate::db::connect().await?;
    crate::db::run_migrations(&db).await?;

    info!(
        "connecting to moderation database (schema {})",
        cfg.moderation_database_schema
    );
    let mod_db = connect_moderation(url, &cfg.moderation_database_schema).await?;

    info!("loading migrated events with a moderation verdict");
    let rows = crate::mapping::moderated_events(&db).await?;
    let total = rows.len();
    info!("seeding {total} processed_content rows");

    let progress = std::io::stderr().is_terminal();
    let pb = ProgressBar::new(total as u64);
    if !progress {
        pb.set_draw_target(ProgressDrawTarget::hidden());
    }
    pb.set_style(
        ProgressStyle::with_template(
            "   seed [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len}",
        )
        .unwrap()
        .progress_chars("=>-"),
    );

    let now = OffsetDateTime::now_utc();
    let mut seeded = 0u64;
    for chunk in rows.chunks(1000) {
        let actives: Vec<pc::ActiveModel> = chunk
            .iter()
            .map(|r| pc::ActiveModel {
                digest_type: Set(r.digest_type),
                digest_bytes: Set(r.digest_bytes.clone()),
                created_at: Set(now),
                updated_at: Set(now),
                status: Set(pc::Status::Success),
                is_csam: Set(Some(false)),
                azure_response: Set(Some(azure_response(r.moderation_tags.as_deref()))),
            })
            .collect();
        // DO NOTHING: never clobber a genuine moderation result already present.
        let affected = pc::Entity::insert_many(actives)
            .on_conflict(
                OnConflict::columns([pc::Column::DigestType, pc::Column::DigestBytes])
                    .do_nothing()
                    .to_owned(),
            )
            .exec_without_returning(&mod_db)
            .await?;
        seeded += affected;
        pb.inc(chunk.len() as u64);
    }
    pb.finish_and_clear();

    println!(
        "seed-moderation: {total} candidates, {seeded} newly seeded (existing rows left as-is)"
    );
    Ok(())
}

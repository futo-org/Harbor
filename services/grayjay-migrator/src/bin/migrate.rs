//! The migration tool. Append-only and continuously runnable: copy new legacy
//! events with `sync-legacy`, then re-run `re-sign` + `push` for just the new
//! events.
//!
//! - `re-sign` (default): author events whose legacy pointer isn't yet migrated,
//!   resuming each system's persisted chain, and store the new bundles unpushed.
//! - `push`: send each system's unpushed bundles, then mark them complete.
//!
//! Status per system: pending -> signed (new bundles awaiting push) -> complete.
//! Push status never gates appending - a complete system with new events returns
//! to signed. Link previews are warmed out of band (`scrape-links`,
//! `enrich-youtube`) into `url_info_cache`; authoring only reads that cache.

use futures::stream::{self, StreamExt};
use grayjay_migrator::polycentric::MigratedContent;
use grayjay_migrator::{config, convert, db, legacy, mapping, og, polycentric, rumble, youtube};
use indicatif::{MultiProgress, ProgressBar, ProgressDrawTarget, ProgressStyle};
use polycentric_common::models::collections;
use polycentric_common::models::protos_v2::{EventBundle, EventKey, Link, PublicKey};
use prost::Message;
use std::collections::{HashMap, HashSet};
use std::io::IsTerminal;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tracing::{error, info, warn};

/// Initialize logging. With progress bars active (a TTY) default to `warn` so
/// INFO chatter doesn't pollute the bars; otherwise default to `info`. Honors
/// `RUST_LOG` when set.
fn init_logging(progress: bool) {
    use tracing_subscriber::EnvFilter;
    let default = if progress { "warn" } else { "info" };
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(default));
    tracing_subscriber::fmt().with_env_filter(filter).init();
}

/// Compact row count for progress messages: `1234567` -> `1.2M`, `45000` -> `45k`.
fn fmt_count(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{}k", n / 1_000)
    } else {
        n.to_string()
    }
}

/// Build the shared progress-bar style: elapsed, bar, position, rate, and ETA.
fn bar_style() -> ProgressStyle {
    ProgressStyle::with_template(
        "{prefix:>8} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} \
         ({per_sec}, ETA {eta}) {msg}",
    )
    .unwrap()
    .progress_chars("=>-")
}

/// A system with its **new** (not-yet-migrated) events, ready to append-author.
struct Prepared {
    system: legacy::LegacySystem,
    legacy_public: PublicKey,
    /// Only the plan items whose legacy pointer isn't already migrated.
    items: Vec<convert::PlanItem>,
    genesis_created_at: u64,
    /// Resumed chain state; genesis is authored only when this is fresh.
    chains: polycentric::SystemChains,
    posts: usize,
    reactions: usize,
    follows: usize,
}

/// Consecutive YouTube Data API batch failures before giving up on enrichment
/// (a run of failures means the daily quota is spent; the scraper covers the rest).
const YOUTUBE_MAX_CONSECUTIVE_FAILURES: usize = 20;

/// Static title for reaction (vote) target links. Reaction targets aren't
/// scraped - only posts (comments/replies) get real previews.
const REACTION_LINK_TITLE: &str = "Grayjay video";

/// Bundles per `put_events` request in the `push` step. Keeps each request a
/// reasonable size while still amortizing round trips for heavy systems.
const PUSH_CHUNK: usize = 256;

/// Rumble rate-limits its oEmbed per IP, so it gets a slow, low-concurrency lane
/// of its own with 429 backoff, separate from the full-speed OG-fetch lane.
const RUMBLE_CONCURRENCY: usize = 3;
const RUMBLE_MAX_RETRIES: usize = 6;

/// Max concurrent OG fetches to a single host. The overall concurrency can be
/// high (many hosts in parallel), but bursting one host (Kick, Bilibili, …)
/// trips its rate limit - so cap per host.
const PER_HOST_CONCURRENCY: usize = 3;

/// 429 retries for a direct OG fetch (Kick and similar volume-limit per IP).
const OG_MAX_RETRIES: usize = 4;

/// Direct OG fetch with 429 backoff (honoring `Retry-After`). `None` on a
/// genuine miss or once retries are spent - those retry on a later run.
async fn resolve_og(http: &reqwest::Client, url: &str) -> Option<(String, String, String)> {
    for attempt in 0..=OG_MAX_RETRIES {
        match og::attempt(http, url).await {
            og::Outcome::Ok {
                title,
                description,
                image,
            } => return Some((title, description, image)),
            og::Outcome::Missing => return None,
            og::Outcome::RateLimited(retry_after) => {
                if attempt == OG_MAX_RETRIES {
                    return None;
                }
                tokio::time::sleep(retry_after.unwrap_or_else(|| rumble_backoff(attempt))).await;
            }
        }
    }
    None
}

/// Host portion of a URL (no scheme, path, or query), for grouping/pacing.
fn host_of(url: &str) -> String {
    url.split_once("://")
        .map(|(_, r)| r)
        .unwrap_or(url)
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .to_string()
}

/// Exponential 429 backoff for Rumble: 2, 4, 8, 16, 32, capped at 60s.
fn rumble_backoff(attempt: usize) -> std::time::Duration {
    std::time::Duration::from_secs((2u64 << attempt).min(60))
}

/// Resolve a Rumble video via oEmbed, retrying on 429 with backoff (honoring
/// `Retry-After`). Returns `None` on a genuine miss or once retries are spent
/// (still rate-limited) - those retry on a later `scrape-links` run.
async fn resolve_rumble(http: &reqwest::Client, url: &str) -> Option<(String, String, String)> {
    for attempt in 0..=RUMBLE_MAX_RETRIES {
        match rumble::oembed(http, url).await {
            rumble::Outcome::Ok { title, thumbnail } => {
                return Some((title, String::new(), thumbnail));
            }
            rumble::Outcome::Missing => return None,
            rumble::Outcome::RateLimited(retry_after) => {
                if attempt == RUMBLE_MAX_RETRIES {
                    return None;
                }
                tokio::time::sleep(retry_after.unwrap_or_else(|| rumble_backoff(attempt))).await;
            }
        }
    }
    None
}

/// Global map: (legacy system hex, legacy pointer) -> the v2 EventKey that post
/// becomes. Used to resolve replies across systems.
type ReplyMap = HashMap<(String, String), EventKey>;

/// URL -> cached link preview, preloaded from `url_info_cache` and shared
/// read-only across workers (populated out of band by `scrape-links`).
type LinkCache = Mutex<HashMap<String, Link>>;

const COMMANDS: &[&str] = &[
    "re-sign",
    "push",
    "sync-legacy",
    "enrich-youtube",
    "scrape-links",
    "seed-moderation",
    "stats",
    "dump-links",
    "probe-url",
];

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    common_dotenv::load(".env");
    let cfg = config::init()?;

    let command = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "re-sign".to_string());
    if !COMMANDS.contains(&command.as_str()) {
        return Err(format!(
            "unknown command {command:?}; expected one of: {}",
            COMMANDS.join(", ")
        )
        .into());
    }

    // Progress bars draw on stderr; when they're shown, keep the log stream at
    // `warn` so INFO lines don't clobber them. Headless runs keep full `info`.
    let progress = std::io::stderr().is_terminal();
    init_logging(progress);

    // `seed-moderation` is a separate mode: pre-seed the moderation service's
    // processed_content from the recorded verdicts, then exit.
    if command == "seed-moderation" {
        grayjay_migrator::seed::run().await?;
        return Ok(());
    }

    // `sync-legacy`: copy the rows we need from the remote legacy DB into local
    // cache tables. Afterwards the migrate step reads only local.
    if command == "sync-legacy" {
        let legacy_url = cfg.legacy_database_url.as_deref().ok_or(
            "POLYCENTRIC_GRAYJAY_MIGRATOR_LEGACY_DATABASE_URL is required for sync-legacy",
        )?;
        info!("connecting to migrator (local) and legacy (remote) databases");
        let db = db::connect().await?;
        db::run_migrations(&db).await?;
        let legacy_db = legacy::connect(legacy_url).await?;
        let pb = ProgressBar::new_spinner();
        if !progress {
            pb.set_draw_target(ProgressDrawTarget::hidden());
        }
        pb.enable_steady_tick(std::time::Duration::from_millis(120));
        pb.set_message("copying legacy rows into local cache…");
        legacy::sync_to_cache(
            &legacy_db,
            &db,
            |n| pb.set_message(format!("caching posts/profiles… {} rows", fmt_count(n))),
            |n| pb.set_message(format!("caching opinions… {} rows", fmt_count(n))),
        )
        .await?;
        pb.finish_with_message("legacy cache populated");
        println!("sync-legacy complete - you can now run the migration (reads local cache)");
        return Ok(());
    }

    // `scrape-links`: warm the preview cache for non-YouTube post links (Rumble
    // via oEmbed, others via a direct OG fetch). Resumable; skips cached URLs.
    if command == "scrape-links" {
        info!("connecting to migrator database");
        let db = db::connect().await?;
        db::run_migrations(&db).await?;

        let mp = MultiProgress::new();
        if !progress {
            mp.set_draw_target(ProgressDrawTarget::hidden());
        }
        let urls = collect_previewable_urls(&db, &mp, progress).await?;
        scrape_links(&db, urls, cfg.concurrency, &mp, progress).await?;
        println!("scrape-links complete - previews cached; the migration authors from cache");
        return Ok(());
    }

    // `enrich-youtube`: resolve YouTube post links via the Data API (the
    // quota-based counterpart to `scrape-links`). Resumable.
    if command == "enrich-youtube" {
        let api_key = cfg
            .youtube_api_key
            .as_deref()
            .ok_or("POLYCENTRIC_GRAYJAY_MIGRATOR_YOUTUBE_API_KEY is required for enrich-youtube")?;
        info!("connecting to migrator database");
        let db = db::connect().await?;
        db::run_migrations(&db).await?;

        let mp = MultiProgress::new();
        if !progress {
            mp.set_draw_target(ProgressDrawTarget::hidden());
        }
        let url_to_id = collect_post_youtube_urls(&db, &mp, progress).await?;
        enrich_youtube_urls(&db, url_to_id, api_key, &mp, progress).await?;
        println!("enrich-youtube complete - YouTube post previews cached");
        return Ok(());
    }

    // `probe-url <url>…`: resolve each given URL the way `scrape-links` does
    // (Rumble via oEmbed, else a direct OG fetch) and print the result. A
    // diagnostic for "why is this host empty?".
    if command == "probe-url" {
        let urls: Vec<String> = std::env::args()
            .skip(2)
            .filter(|a| a.starts_with("http"))
            .collect();
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()?;
        for url in urls {
            let meta = if rumble::is_video_url(&url) {
                resolve_rumble(&http, &url).await
            } else {
                resolve_og(&http, &url).await
            };
            match meta {
                Some((t, d, i)) if !(t.is_empty() && d.is_empty() && i.is_empty()) => {
                    println!("OK    {url}\n      title={t:?} image={i:?}");
                }
                Some(_) => println!("EMPTY {url} (no usable tags)"),
                None => println!("NONE  {url} (fetch failed / rate-limited)"),
            }
        }
        return Ok(());
    }

    // `dump-links`: print the uncached non-YouTube post links (the `scrape-links`
    // todo), one per line, for offline analysis of what's still failing.
    if command == "dump-links" {
        let db = db::connect().await?;
        db::run_migrations(&db).await?;
        let mp = MultiProgress::new();
        mp.set_draw_target(ProgressDrawTarget::hidden());
        let urls = collect_previewable_urls(&db, &mp, false).await?;
        let cached: HashSet<String> = mapping::load_url_cache(&db)
            .await?
            .into_iter()
            .map(|(u, ..)| u)
            .collect();
        for u in urls {
            if !cached.contains(&u) {
                println!("{u}");
            }
        }
        return Ok(());
    }

    // `stats`: decode the local cache and report the link workload - posts with
    // links (and YouTube links) vs reactions - then exit.
    if command == "stats" {
        info!("connecting to migrator database");
        let db = db::connect().await?;
        db::run_migrations(&db).await?;
        let mp = MultiProgress::new();
        if !progress {
            mp.set_draw_target(ProgressDrawTarget::hidden());
        }
        report_stats(&db, &mp, progress).await?;
        return Ok(());
    }

    // `push`: send each `signed` system's unpushed bundles, then mark complete.
    if command == "push" {
        if cfg.servers.is_empty() {
            return Err("POLYCENTRIC_GRAYJAY_MIGRATOR_SERVERS is required for push".into());
        }
        info!("connecting to migrator database");
        let db = db::connect().await?;
        db::run_migrations(&db).await?;
        let mp = MultiProgress::new();
        if !progress {
            mp.set_draw_target(ProgressDrawTarget::hidden());
        }
        run_push(&db, &cfg.servers, cfg.concurrency, &mp, progress).await?;
        return Ok(());
    }

    // Default / `re-sign`: author new events locally; nothing is pushed.
    let signing_key = cfg
        .signing_key
        .as_deref()
        .ok_or("POLYCENTRIC_GRAYJAY_MIGRATOR_SIGNING_KEY is required")?;

    let authoring = polycentric::Authoring::new(signing_key, cfg.identity_servers.clone())?;
    let master_public = authoring.master_public();

    info!("connecting to migrator database");
    let db = db::connect().await?;
    db::run_migrations(&db).await?;

    // Migrated pointers filter out already-authored events; chain state resumes signing.
    info!("loading already-migrated state");
    let migrated_pointers = mapping::all_migrated_pointers(&db).await?;
    let mut chains_by_system = mapping::all_chains(&db).await?;
    info!(
        "{} events already migrated across {} systems with chain state",
        fmt_count(migrated_pointers.len() as u64),
        fmt_count(chains_by_system.len() as u64),
    );

    // Progress visualizer: real bars on a TTY, hidden (falls back to log lines)
    // otherwise - e.g. in Kubernetes.
    let mp = MultiProgress::new();
    if !progress {
        mp.set_draw_target(ProgressDrawTarget::hidden());
    }

    // Systems come from the local cache (populated by `sync-legacy`).
    info!("listing cached legacy systems");
    let spinner = mp.add(ProgressBar::new_spinner());
    spinner.enable_steady_tick(std::time::Duration::from_millis(120));
    spinner.set_message("listing cached systems…");
    let systems = legacy::cached_list_systems(&db).await?;
    if systems.is_empty() {
        return Err(
            "legacy cache is empty - run `grayjay-migrate sync-legacy` first to populate it".into(),
        );
    }
    spinner.finish_with_message(format!("found {} cached systems", systems.len()));

    let mut skipped = 0usize;
    let mut targets = Vec::new();
    for system in systems {
        let key_hex = system.key_hex();
        match legacy::to_v2_public_key(&system) {
            Some(legacy_public) => targets.push((system, legacy_public)),
            None => {
                warn!(
                    "skipping system {key_hex}: unsupported key_type {}",
                    system.key_type
                );
                skipped += 1;
            }
        }
    }

    // Phase 1: plan every system and build the reply map, before any authoring.
    let total = targets.len();
    info!(
        "phase 1/2: preparing {total} legacy systems ({} skipped) with concurrency {}",
        skipped, cfg.concurrency
    );
    let p1 = mp.add(ProgressBar::new(total as u64));
    p1.set_style(bar_style());
    p1.set_prefix("prepare");
    // Bulk-load posts/profiles and deduplicated opinions grouped by system, then
    // plan locally. Maps are drained as plans are built to bound peak memory.
    p1.enable_steady_tick(std::time::Duration::from_millis(120));
    info!("loading posts/profiles from local cache");
    p1.set_message("loading posts/profiles from cache…");
    let mut events_map = legacy::load_events_by_system(&db, |n| {
        p1.set_message(format!("loading posts/profiles… {} rows", fmt_count(n)));
    })
    .await?;
    info!("loading deduplicated opinions from local cache");
    p1.set_message("loading opinions from cache…");
    let mut opinions_map = legacy::load_opinions_by_system(&db, |n| {
        p1.set_message(format!("loading opinions… {} rows", fmt_count(n)));
    })
    .await?;
    p1.set_message("planning systems…");

    // Reply-map base: posts migrated on earlier runs, so a new reply can point at
    // them. New posts (this run) are added below with continued FEED sequences.
    let mut reply_map = ReplyMap::new();
    for (key_hex, pointer, identity, sequence) in
        mapping::migrated_feed_events(&db, collections::FEED).await?
    {
        reply_map.insert(
            (key_hex, pointer),
            EventKey {
                collection: collections::FEED,
                identity,
                signed_by: Some(master_public.clone()),
                sequence: sequence as u64,
            },
        );
    }

    let mut prepared: Vec<Prepared> = Vec::with_capacity(total);
    let mut identity_rows: Vec<(String, i64, String)> = Vec::new();
    let mut unchanged = 0usize;
    for (system, legacy_public) in targets {
        let events = events_map.remove(&system.key).unwrap_or_default();
        let opinions = opinions_map.remove(&system.key).unwrap_or_default();
        let plan = convert::plan(&events, &opinions);
        let key_hex = system.key_hex();

        // Resume the system's chain; author only pointers not yet migrated.
        let chain_rows = chains_by_system.remove(&key_hex).unwrap_or_default();
        let chains = polycentric::SystemChains::resume(chain_rows);
        // The IDENTITY row is written when genesis is authored, so its presence
        // means this system already exists on the network.
        let genesis_done = chains.last_sequence(collections::IDENTITY) > 0;
        let items: Vec<convert::PlanItem> = plan
            .items
            .into_iter()
            .filter(|it| {
                it.source
                    .as_deref()
                    .is_none_or(|p| !migrated_pointers.contains(p))
            })
            .collect();

        p1.inc(1);
        if items.is_empty() && genesis_done {
            unchanged += 1;
            continue;
        }

        let identity = authoring.identity_string(&legacy_public);
        // Brand-new systems get a `pending` row for the lookup endpoint.
        if !genesis_done {
            identity_rows.push((key_hex.clone(), system.key_type, identity.clone()));
        }

        // Register this run's new posts for reply resolution, continuing the
        // FEED sequence past what's already migrated.
        let mut feed_seq = chains.last_sequence(collections::FEED);
        let mut posts = 0usize;
        let mut reactions = 0usize;
        let mut follows = 0usize;
        for item in &items {
            match &item.body {
                convert::PlanBody::Post(_) => {
                    posts += 1;
                    feed_seq += 1;
                    if let Some(pointer) = &item.source {
                        reply_map.insert(
                            (key_hex.clone(), pointer.clone()),
                            EventKey {
                                collection: collections::FEED,
                                identity: identity.clone(),
                                signed_by: Some(master_public.clone()),
                                sequence: feed_seq,
                            },
                        );
                    }
                }
                convert::PlanBody::Reaction(_) | convert::PlanBody::AttributedReaction { .. } => {
                    reactions += 1;
                }
                convert::PlanBody::Follow { .. } => follows += 1,
                convert::PlanBody::Ready(_) => {}
            }
        }

        prepared.push(Prepared {
            system,
            legacy_public,
            items,
            genesis_created_at: plan.genesis_created_at,
            chains,
            posts,
            reactions,
            follows,
        });
        let n = prepared.len();
        if !progress && n % 5000 == 0 {
            info!("phase 1/2: prepared {n} systems with new events");
        }
        if identity_rows.len() >= 5000 {
            mapping::upsert_pending_many(&db, &identity_rows).await?;
            identity_rows.clear();
        }
    }
    mapping::upsert_pending_many(&db, &identity_rows).await?;
    p1.finish_with_message(format!(
        "{} systems with new events ({} unchanged)",
        prepared.len(),
        unchanged
    ));

    // Resolve YouTube previews via the Data API into the cache before authoring.
    if let Some(api_key) = cfg.youtube_api_key.as_deref() {
        enrich_youtube(&db, &prepared, api_key, &mp, progress).await?;
    }

    // `reply_map` was assembled in phase 1 (migrated posts + this run's posts).
    info!(
        "phase 2/2: authoring {} systems ({} posts mapped for reply resolution)",
        prepared.len(),
        reply_map.len()
    );

    // Phase 2: author each system concurrently, reading previews from the cache.
    let link_cache: LinkCache = Mutex::new(HashMap::new());
    {
        let cached = mapping::load_url_cache(&db).await?;
        let mut lc = link_cache.lock().unwrap();
        for (url, title, description, image) in cached {
            lc.insert(
                url.clone(),
                Link {
                    title,
                    description,
                    image,
                    url,
                },
            );
        }
        if !lc.is_empty() {
            info!("preloaded {} cached link previews", lc.len());
        }
    }

    // Advance the bar per authored event so heavy systems show steady movement.
    let total_events: u64 = prepared
        .iter()
        .map(|p| p.items.len() as u64 + 1) // +1 for genesis
        .sum();
    let p2 = mp.add(ProgressBar::new(total_events));
    p2.set_style(bar_style());
    p2.set_prefix("author");
    // `tokio::spawn` spreads the CPU-bound signing across worker threads;
    // `buffer_unordered` alone would poll every future on one thread.
    let ok = Arc::new(AtomicUsize::new(0));
    let fail = Arc::new(AtomicUsize::new(0));
    let posts = Arc::new(AtomicUsize::new(0));
    let reactions = Arc::new(AtomicUsize::new(0));
    let follows = Arc::new(AtomicUsize::new(0));
    let timings = Arc::new(Timings::default());
    let db = Arc::new(db);
    let authoring = Arc::new(authoring);
    let reply_map = Arc::new(reply_map);
    let link_cache = Arc::new(link_cache);

    stream::iter(prepared.into_iter().map(|prep| {
        let (db, authoring, reply_map, link_cache, timings) = (
            db.clone(),
            authoring.clone(),
            reply_map.clone(),
            link_cache.clone(),
            timings.clone(),
        );
        let (p2, ok, fail, posts, reactions, follows) = (
            p2.clone(),
            ok.clone(),
            fail.clone(),
            posts.clone(),
            reactions.clone(),
            follows.clone(),
        );
        tokio::spawn(async move {
            let key_hex = prep.system.key_hex();
            let (p_posts, p_reactions, p_follows) = (prep.posts, prep.reactions, prep.follows);
            match author_system(
                &db,
                &authoring,
                prep,
                &reply_map,
                &link_cache,
                &p2,
                &timings,
            )
            .await
            {
                Ok(()) => {
                    ok.fetch_add(1, Ordering::Relaxed);
                    posts.fetch_add(p_posts, Ordering::Relaxed);
                    reactions.fetch_add(p_reactions, Ordering::Relaxed);
                    follows.fetch_add(p_follows, Ordering::Relaxed);
                }
                Err(e) => {
                    fail.fetch_add(1, Ordering::Relaxed);
                    error!("failed to migrate {key_hex}: {e}");
                }
            }
            let done = ok.load(Ordering::Relaxed) + fail.load(Ordering::Relaxed);
            if done % 2000 == 0 && done > 0 {
                info!(
                    "author avg/system: build {}ms · persist {}ms · record {}ms",
                    timings.build.load(Ordering::Relaxed) / done as u64 / 1000,
                    timings.push.load(Ordering::Relaxed) / done as u64 / 1000,
                    timings.record.load(Ordering::Relaxed) / done as u64 / 1000,
                );
            }
            p2.set_message(format!(
                "✓{} ✗{} systems · {}p {}r · build{}/rec{}ms",
                ok.load(Ordering::Relaxed),
                fail.load(Ordering::Relaxed),
                posts.load(Ordering::Relaxed),
                reactions.load(Ordering::Relaxed),
                timings.build.load(Ordering::Relaxed) / done.max(1) as u64 / 1000,
                timings.record.load(Ordering::Relaxed) / done.max(1) as u64 / 1000,
            ));
        })
    }))
    .buffer_unordered(cfg.concurrency)
    .collect::<Vec<_>>()
    .await;

    let migrated = ok.load(Ordering::Relaxed);
    let failed = fail.load(Ordering::Relaxed);
    p2.finish_with_message(format!(
        "✓{migrated} ✗{failed} · {}p {}r",
        posts.load(Ordering::Relaxed),
        reactions.load(Ordering::Relaxed)
    ));

    println!(
        "re-sign done: {migrated} signed, {skipped} skipped, {failed} failed, \
         {} posts, {} reactions, {} follows. Run `push` to send them.",
        posts.load(Ordering::Relaxed),
        reactions.load(Ordering::Relaxed),
        follows.load(Ordering::Relaxed)
    );
    if failed > 0 {
        return Err(format!("{failed} systems failed to sign").into());
    }
    Ok(())
}

/// Accumulated wall-time (micros) in each author sub-step, to locate the
/// bottleneck: `build` = sign the chain, `push` = send to the server(s),
/// `record` = write the local rows.
#[derive(Default)]
struct Timings {
    build: AtomicU64,
    push: AtomicU64,
    record: AtomicU64,
}

/// Report the link workload (posts vs reactions, YouTube vs other) from the cache.
async fn report_stats(
    db: &sea_orm::DatabaseConnection,
    mp: &MultiProgress,
    progress: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let spinner = mp.add(ProgressBar::new_spinner());
    if !progress {
        spinner.set_draw_target(ProgressDrawTarget::hidden());
    }
    spinner.enable_steady_tick(std::time::Duration::from_millis(120));
    spinner.set_message("loading posts/profiles from cache…");
    let mut events_map = legacy::load_events_by_system(db, |n| {
        spinner.set_message(format!("loading posts/profiles… {} rows", fmt_count(n)));
    })
    .await?;
    spinner.set_message("loading opinions from cache…");
    let mut opinions_map = legacy::load_opinions_by_system(db, |n| {
        spinner.set_message(format!("loading opinions… {} rows", fmt_count(n)));
    })
    .await?;
    spinner.set_message("planning + tallying…");

    let systems = legacy::cached_list_systems(db).await?;
    let (mut posts, mut posts_with_link, mut posts_with_yt) = (0u64, 0u64, 0u64);
    let (mut react_url, mut react_yt, mut react_other_http, mut react_nonurl, mut react_in_net) =
        (0u64, 0u64, 0u64, 0u64, 0u64);
    let mut follows = 0u64;
    let mut post_link_urls: HashSet<String> = HashSet::new();
    let mut post_yt_ids: HashSet<String> = HashSet::new();
    let mut react_yt_ids: HashSet<String> = HashSet::new();
    let mut react_other_urls: HashSet<String> = HashSet::new();

    for system in systems {
        let events = events_map.remove(&system.key).unwrap_or_default();
        let opinions = opinions_map.remove(&system.key).unwrap_or_default();
        let plan = convert::plan(&events, &opinions);
        for item in &plan.items {
            match &item.body {
                convert::PlanBody::Post(post) => {
                    posts += 1;
                    let mut has_link = false;
                    let mut has_yt = false;
                    for t in &post.topics {
                        if t.previewable {
                            has_link = true;
                            post_link_urls.insert(t.url.clone());
                        }
                        if let Some(id) = youtube::video_id(&t.url) {
                            has_yt = true;
                            post_yt_ids.insert(id);
                        }
                    }
                    posts_with_link += has_link as u64;
                    posts_with_yt += has_yt as u64;
                }
                convert::PlanBody::AttributedReaction { url, .. } => {
                    react_url += 1;
                    if let Some(id) = youtube::video_id(url) {
                        react_yt += 1;
                        react_yt_ids.insert(id);
                    } else if url.starts_with("http://") || url.starts_with("https://") {
                        react_other_http += 1;
                        react_other_urls.insert(url.clone());
                    } else {
                        react_nonurl += 1;
                    }
                }
                convert::PlanBody::Reaction(_) => react_in_net += 1,
                convert::PlanBody::Follow { .. } => follows += 1,
                convert::PlanBody::Ready(_) => {}
            }
        }
    }
    spinner.finish_and_clear();

    let all_yt_ids: HashSet<&String> = post_yt_ids.iter().chain(react_yt_ids.iter()).collect();

    println!("POSTS");
    println!("  total posts              {posts}");
    println!(
        "  posts with a link        {posts_with_link}  ({:.1}%)",
        pct(posts_with_link, posts)
    );
    println!(
        "  posts with a YouTube link {posts_with_yt}  ({:.1}%)",
        pct(posts_with_yt, posts)
    );
    println!("  distinct post link URLs  {}", post_link_urls.len());
    println!("  distinct post YouTube ids {}", post_yt_ids.len());
    println!("REACTIONS");
    println!("  external-URL votes       {react_url}");
    println!("    YouTube                {react_yt}");
    println!("    other http(s)          {react_other_http}");
    println!("    non-URL (legacy-ref)   {react_nonurl}");
    println!("  in-network votes (posts) {react_in_net}");
    println!("FOLLOWS  {follows}");
    println!("  distinct reaction YouTube ids {}", react_yt_ids.len());
    println!("  distinct reaction other URLs  {}", react_other_urls.len());
    let post_non_yt = post_link_urls
        .iter()
        .filter(|u| youtube::video_id(u).is_none())
        .count();
    println!(
        "PREVIEW WORKLOAD (posts only; reactions use a static \"{REACTION_LINK_TITLE}\" title)"
    );
    println!(
        "  post YouTube videos to resolve (Data API) {}",
        post_yt_ids.len()
    );
    println!("  post non-YouTube URLs to scrape           {post_non_yt}");
    println!(
        "  (for reference) all distinct YouTube videos incl. reactions {}",
        all_yt_ids.len()
    );
    Ok(())
}

/// Percentage of `n` over `d`, guarding division by zero.
fn pct(n: u64, d: u64) -> f64 {
    if d == 0 {
        0.0
    } else {
        n as f64 * 100.0 / d as f64
    }
}

/// Distinct non-YouTube previewable post links for `scrape-links` (YouTube goes
/// via `enrich-youtube`). Reads the local cache only.
async fn collect_previewable_urls(
    db: &sea_orm::DatabaseConnection,
    mp: &MultiProgress,
    progress: bool,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let spinner = mp.add(ProgressBar::new_spinner());
    if !progress {
        spinner.set_draw_target(ProgressDrawTarget::hidden());
    }
    spinner.enable_steady_tick(std::time::Duration::from_millis(120));
    spinner.set_message("loading posts from cache…");
    // Posts only - reaction targets aren't scraped, so opinions aren't loaded.
    let mut events_map = legacy::load_events_by_system(db, |n| {
        spinner.set_message(format!("loading posts… {} rows", fmt_count(n)));
    })
    .await?;

    let systems = legacy::cached_list_systems(db).await?;
    let mut urls: HashSet<String> = HashSet::new();
    for system in systems {
        let events = events_map.remove(&system.key).unwrap_or_default();
        let plan = convert::plan(&events, &[]);
        for item in &plan.items {
            if let convert::PlanBody::Post(post) = &item.body {
                for topic in &post.topics {
                    // Exclude all YouTube hosts (channels/playlists too) - the
                    // scraper rate-limits them; YouTube goes via the Data API.
                    if topic.previewable && !youtube::is_youtube_url(&topic.url) {
                        urls.insert(topic.url.clone());
                    }
                }
            }
        }
    }
    spinner.finish_with_message(format!(
        "{} non-YouTube post links",
        fmt_count(urls.len() as u64)
    ));
    log_top_hosts(&urls);
    Ok(urls.into_iter().collect())
}

/// Format the top hosts of a `host -> count` map as `"host n, …"` (top 15).
fn top_hosts(counts: &HashMap<String, usize>) -> String {
    let mut top: Vec<(&String, &usize)> = counts.iter().collect();
    top.sort_by(|a, b| b.1.cmp(a.1));
    top.iter()
        .take(15)
        .map(|(host, n)| format!("{host} {n}"))
        .collect::<Vec<_>>()
        .join(", ")
}

/// Log the most common hosts in a URL set (what `scrape-links` will hit).
fn log_top_hosts(urls: &HashSet<String>) {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for url in urls {
        *counts.entry(host_of(url)).or_default() += 1;
    }
    info!("scrape-links top hosts: {}", top_hosts(&counts));
}

/// Collect distinct **YouTube** post links mapped to their video id, for the
/// standalone `enrich-youtube` step. Reads the local cache only.
async fn collect_post_youtube_urls(
    db: &sea_orm::DatabaseConnection,
    mp: &MultiProgress,
    progress: bool,
) -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
    let spinner = mp.add(ProgressBar::new_spinner());
    if !progress {
        spinner.set_draw_target(ProgressDrawTarget::hidden());
    }
    spinner.enable_steady_tick(std::time::Duration::from_millis(120));
    spinner.set_message("loading posts from cache…");
    let mut events_map = legacy::load_events_by_system(db, |n| {
        spinner.set_message(format!("loading posts… {} rows", fmt_count(n)));
    })
    .await?;

    let systems = legacy::cached_list_systems(db).await?;
    let mut url_to_id: HashMap<String, String> = HashMap::new();
    for system in systems {
        let events = events_map.remove(&system.key).unwrap_or_default();
        let plan = convert::plan(&events, &[]);
        for item in &plan.items {
            if let convert::PlanBody::Post(post) = &item.body {
                for topic in &post.topics {
                    if let Some(id) = youtube::video_id(&topic.url) {
                        url_to_id.insert(topic.url.clone(), id);
                    }
                }
            }
        }
    }
    spinner.finish_with_message(format!(
        "{} YouTube post links",
        fmt_count(url_to_id.len() as u64)
    ));
    Ok(url_to_id)
}

/// Resolve `urls` into `url_info_cache` (Rumble via oEmbed, others via direct OG
/// fetch), skipping cached URLs. Empties stay uncached and retry on a re-run.
async fn scrape_links(
    db: &sea_orm::DatabaseConnection,
    urls: Vec<String>,
    concurrency: usize,
    mp: &MultiProgress,
    progress: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let already: HashSet<String> = mapping::load_url_cache(db)
        .await?
        .into_iter()
        .map(|(url, ..)| url)
        .collect();
    let todo: Vec<String> = urls.into_iter().filter(|u| !already.contains(u)).collect();
    if todo.is_empty() {
        info!("scrape-links: all referenced links already cached");
        return Ok(());
    }
    info!(
        "scrape-links: {} to scrape ({} already cached) with concurrency {concurrency}",
        fmt_count(todo.len() as u64),
        fmt_count(already.len() as u64),
    );

    let bar = mp.add(ProgressBar::new(todo.len() as u64));
    if !progress {
        bar.set_draw_target(ProgressDrawTarget::hidden());
    }
    bar.set_style(bar_style());
    bar.set_prefix("scrape");

    // Two concurrent lanes: OG fetch at full concurrency, and a slow paced lane
    // for Rumble (which rate-limits its oEmbed per IP).
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()?;
    let (rumble_urls, other_urls): (Vec<String>, Vec<String>) =
        todo.into_iter().partition(|u| rumble::is_video_url(u));
    info!(
        "scrape-links: {} via OG fetch, {} Rumble via oEmbed (paced)",
        fmt_count(other_urls.len() as u64),
        fmt_count(rumble_urls.len() as u64),
    );
    // Cap concurrency per host: overall high, but at most PER_HOST_CONCURRENCY
    // in flight to any one host so a host-heavy tail doesn't burst its limiter.
    let host_sems: Arc<Mutex<HashMap<String, Arc<tokio::sync::Semaphore>>>> =
        Arc::new(Mutex::new(HashMap::new()));
    let other = stream::iter(other_urls.into_iter().map(|url| {
        let http = &http;
        let host_sems = host_sems.clone();
        async move {
            let sem = host_sems
                .lock()
                .unwrap()
                .entry(host_of(&url))
                .or_insert_with(|| Arc::new(tokio::sync::Semaphore::new(PER_HOST_CONCURRENCY)))
                .clone();
            let _permit = sem.acquire().await.ok();
            (url.clone(), resolve_og(http, &url).await)
        }
    }))
    .buffer_unordered(concurrency);
    let rumble = stream::iter(rumble_urls.into_iter().map(|url| {
        let http = &http;
        async move { (url.clone(), resolve_rumble(http, &url).await) }
    }))
    .buffer_unordered(RUMBLE_CONCURRENCY);
    let results = stream::select(other, rumble);
    tokio::pin!(results);

    let mut batch: Vec<(String, String, String, String)> = Vec::new();
    let mut cached = 0usize;
    let mut empty = 0usize;
    // Per-host empty counts, so the tail of empties is attributable (dead links
    // vs a host that's rate-limiting) rather than a mystery.
    let mut empty_by_host: HashMap<String, usize> = HashMap::new();
    while let Some((url, meta)) = results.next().await {
        match meta {
            Some((title, description, image))
                if !(title.is_empty() && description.is_empty() && image.is_empty()) =>
            {
                batch.push((url, title, description, image));
            }
            _ => {
                empty += 1;
                *empty_by_host.entry(host_of(&url)).or_default() += 1;
            }
        }
        bar.inc(1);
        if batch.len() >= 500 {
            cached += batch.len();
            mapping::insert_url_cache_many(db, &batch).await?;
            batch.clear();
        }
        bar.set_message(format!(
            "{} cached · {} empty",
            fmt_count((cached + batch.len()) as u64),
            fmt_count(empty as u64)
        ));
        // Periodically surface where empties are coming from (the run doesn't
        // "finish" until the slow Rumble lane drains, so don't wait for the end).
        if empty > 0 && empty % 2000 == 0 {
            info!("scrape-links empties so far: {}", top_hosts(&empty_by_host));
        }
    }
    if !batch.is_empty() {
        cached += batch.len();
        mapping::insert_url_cache_many(db, &batch).await?;
    }
    bar.finish_with_message(format!(
        "{} cached, {} empty",
        fmt_count(cached as u64),
        fmt_count(empty as u64)
    ));
    info!(
        "scrape-links: cached {} previews ({} empty, retried next run). Top empty hosts: {}",
        fmt_count(cached as u64),
        fmt_count(empty as u64),
        top_hosts(&empty_by_host),
    );
    Ok(())
}

/// Resolve every YouTube post link referenced by `prepared` via the Data API and
/// seed the URL cache. Reactions are not enriched - their targets use a static
/// title instead of a resolved preview.
async fn enrich_youtube(
    db: &sea_orm::DatabaseConnection,
    prepared: &[Prepared],
    api_key: &str,
    mp: &MultiProgress,
    progress: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // Every YouTube URL referenced by a post topic, mapped to its video id
    // (multiple URL forms can share one id).
    let mut url_to_id: HashMap<String, String> = HashMap::new();
    for prep in prepared {
        for item in &prep.items {
            if let convert::PlanBody::Post(post) = &item.body {
                for topic in &post.topics {
                    if let Some(id) = youtube::video_id(&topic.url) {
                        url_to_id.insert(topic.url.clone(), id);
                    }
                }
            }
        }
    }
    enrich_youtube_urls(db, url_to_id, api_key, mp, progress).await
}

/// Data-API core: resolve the given `url -> video id` map into cached previews.
/// Skips already-cached URLs (resumable), persists each batch immediately, and
/// stops after sustained quota failures.
async fn enrich_youtube_urls(
    db: &sea_orm::DatabaseConnection,
    mut url_to_id: HashMap<String, String>,
    api_key: &str,
    mp: &MultiProgress,
    progress: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    if url_to_id.is_empty() {
        return Ok(());
    }

    // Skip URLs already cached (a prior run, or the scraper), so a restarted or
    // resumed enrichment only fetches what's still missing.
    let already: HashSet<String> = mapping::load_url_cache(db)
        .await?
        .into_iter()
        .map(|(url, ..)| url)
        .collect();
    url_to_id.retain(|url, _| !already.contains(url));
    if url_to_id.is_empty() {
        info!("youtube: all referenced videos already cached");
        return Ok(());
    }

    // Inverse map, so one fetched id fills every URL form that points at it.
    let mut id_to_urls: HashMap<String, Vec<String>> = HashMap::new();
    for (url, id) in &url_to_id {
        id_to_urls.entry(id.clone()).or_default().push(url.clone());
    }
    let unique_ids: Vec<String> = id_to_urls.keys().cloned().collect();
    info!(
        "youtube: resolving {} videos ({} URL forms) via the Data API",
        unique_ids.len(),
        url_to_id.len()
    );

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let bar = mp.add(ProgressBar::new(unique_ids.len() as u64));
    if !progress {
        bar.set_draw_target(ProgressDrawTarget::hidden());
    }
    bar.set_style(bar_style());
    bar.set_prefix("youtube");

    // Fetch 50 ids at a time and persist each batch immediately, so progress is
    // durable and a later run resumes from the cache instead of re-fetching.
    let mut cached = 0usize;
    let mut consecutive_failures = 0usize;
    for chunk in unique_ids.chunks(youtube::BATCH) {
        match youtube::fetch_batch(&http, api_key, chunk).await {
            Ok(found) => {
                consecutive_failures = 0;
                let mut rows: Vec<(String, String, String, String)> = Vec::new();
                for (id, m) in &found {
                    for url in id_to_urls.get(id).into_iter().flatten() {
                        rows.push((
                            url.clone(),
                            m.title.clone(),
                            m.description.clone(),
                            m.thumbnail.clone(),
                        ));
                    }
                }
                if !rows.is_empty() {
                    mapping::insert_url_cache_many(db, &rows).await?;
                    cached += rows.len();
                }
            }
            // Sustained failures mean the daily quota is spent; stop rather than
            // grind through guaranteed-failing calls. Others fall back to scraping.
            Err(e) => {
                warn!("youtube api batch failed: {e}");
                consecutive_failures += 1;
                if consecutive_failures >= YOUTUBE_MAX_CONSECUTIVE_FAILURES {
                    warn!(
                        "youtube: {consecutive_failures} consecutive failures (quota exhausted?); \
                         stopping enrichment - remaining URLs fall back to the scraper"
                    );
                    break;
                }
            }
        }
        bar.inc(chunk.len() as u64);
    }
    bar.finish_with_message(format!("{cached} cached"));
    info!("youtube: cached {cached} URL previews this run");
    Ok(())
}

async fn author_system(
    db: &sea_orm::DatabaseConnection,
    authoring: &polycentric::Authoring,
    mut prep: Prepared,
    reply_map: &ReplyMap,
    link_cache: &LinkCache,
    events_bar: &ProgressBar,
    timings: &Timings,
) -> Result<(), String> {
    let key_hex = prep.system.key_hex();

    // Finalize planned items: serialize deferred posts, resolving replies and
    // unfurling link previews.
    let mut contents = Vec::with_capacity(prep.items.len());
    for item in &prep.items {
        let content_bytes = match &item.body {
            convert::PlanBody::Ready(bytes) => bytes.clone(),
            convert::PlanBody::Post(post) => {
                // Only http(s) topics unfurl into a rich link preview; other
                // schemes and legacy-id refs are attribution-only.
                let mut links = Vec::new();
                for topic in &post.topics {
                    if topic.previewable {
                        links.push(resolve_link(&topic.url, link_cache));
                    }
                }
                convert::finalize_post(post, reply_map, &links)
            }
            convert::PlanBody::Reaction(reaction) => {
                match convert::finalize_reaction(reaction, reply_map) {
                    Some(bytes) => bytes,
                    // Target post wasn't migrated; drop this reaction. Still
                    // count it against the progress bar so the total lines up.
                    None => {
                        events_bar.inc(1);
                        continue;
                    }
                }
            }
            convert::PlanBody::AttributedReaction { url, positive } => {
                // Reaction targets aren't scraped - a static title, not a preview.
                let link = Link {
                    title: REACTION_LINK_TITLE.to_string(),
                    url: url.clone(),
                    ..Default::default()
                };
                convert::finalize_attributed_reaction(&link, *positive)
            }
            convert::PlanBody::Follow { followed_key } => {
                convert::finalize_follow(&authoring.identity_string_for_key(followed_key))
            }
        };
        contents.push(MigratedContent {
            collection: item.collection,
            content_bytes,
            created_at: item.created_at,
            source: item.source.clone(),
            content_type: item.content_type,
        });
    }

    let t = std::time::Instant::now();
    // Resume the chain: genesis is authored only when fresh, and new events
    // continue the persisted sequences/Merkle.
    let (identity, bundles, authored) = authoring.build_bundles(
        &prep.legacy_public,
        &contents,
        prep.genesis_created_at,
        &mut prep.chains,
        || events_bar.inc(1),
    )?;
    timings
        .build
        .fetch_add(t.elapsed().as_micros() as u64, Ordering::Relaxed);

    // Append the new bundles (unpushed) and persist the advanced chain state, so
    // the separate `push` step sends only these and a later run resumes from here.
    let t = std::time::Instant::now();
    let encoded: Vec<Vec<u8>> = bundles.iter().map(|b| b.encode_to_vec()).collect();
    mapping::append_bundles(db, &key_hex, &encoded)
        .await
        .map_err(|e| format!("persist bundles: {e}"))?;
    mapping::upsert_chains(db, &key_hex, &prep.chains.export())
        .await
        .map_err(|e| format!("persist chain state: {e}"))?;
    timings
        .push
        .fetch_add(t.elapsed().as_micros() as u64, Ordering::Relaxed);
    let t = std::time::Instant::now();

    // Legacy moderation verdict/tags per source pointer, carried onto the rows
    // so the new moderation service can skip re-scoring migrated content.
    let moderation: HashMap<&str, (Option<&str>, Option<&str>)> = prep
        .items
        .iter()
        .filter_map(|it| {
            it.source.as_deref().map(|p| {
                (
                    p,
                    (
                        it.moderation_status.as_deref(),
                        it.moderation_tags.as_deref(),
                    ),
                )
            })
        })
        .collect();
    let event_rows: Vec<mapping::AuthoredEventRow> = authored
        .iter()
        .filter_map(|event| {
            event.source.as_deref().map(|pointer| {
                let (moderation_status, moderation_tags) =
                    moderation.get(pointer).copied().unwrap_or((None, None));
                mapping::AuthoredEventRow {
                    legacy_system_key_hex: &key_hex,
                    legacy_pointer: pointer,
                    identity: &identity,
                    collection: event.collection,
                    sequence: event.sequence as i64,
                    signature_hex: &event.signature_hex,
                    content_type: event.content_type,
                    content_digest_type: event.digest_type,
                    content_digest_bytes: &event.digest_bytes,
                    moderation_status,
                    moderation_tags,
                }
            })
        })
        .collect();
    mapping::upsert_events(db, event_rows)
        .await
        .map_err(|e| format!("record migrated events: {e}"))?;

    // `signed`: authored + bundles persisted, awaiting the `push` step.
    mapping::upsert(db, &key_hex, prep.system.key_type, &identity, "signed")
        .await
        .map_err(|e| format!("finalize mapping: {e}"))?;
    timings
        .record
        .fetch_add(t.elapsed().as_micros() as u64, Ordering::Relaxed);

    info!(
        "  {identity}: +{} posts, +{} reaction(s) appended [signed]",
        prep.posts, prep.reactions,
    );
    Ok(())
}

/// Look up a preview from the preloaded cache; a miss yields a bare `Link { url }`.
fn resolve_link(url: &str, cache: &LinkCache) -> Link {
    cache
        .lock()
        .unwrap()
        .get(url)
        .cloned()
        .unwrap_or_else(|| Link {
            url: url.to_string(),
            ..Default::default()
        })
}

/// Push each `signed` system's unpushed bundles concurrently, then mark complete.
async fn run_push(
    db: &sea_orm::DatabaseConnection,
    servers: &[String],
    concurrency: usize,
    mp: &MultiProgress,
    progress: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let spinner = mp.add(ProgressBar::new_spinner());
    if !progress {
        spinner.set_draw_target(ProgressDrawTarget::hidden());
    }
    spinner.enable_steady_tick(std::time::Duration::from_millis(120));
    spinner.set_message("listing signed systems…");
    let targets = mapping::signed_systems(db).await?;
    spinner.finish_and_clear();
    if targets.is_empty() {
        println!("push: nothing to send (no systems in the 'signed' state; run re-sign first)");
        return Ok(());
    }
    info!("push: {} systems to send", fmt_count(targets.len() as u64));

    let bar = mp.add(ProgressBar::new(targets.len() as u64));
    if !progress {
        bar.set_draw_target(ProgressDrawTarget::hidden());
    }
    bar.set_style(bar_style());
    bar.set_prefix("push");

    let ok = Arc::new(AtomicUsize::new(0));
    let fail = Arc::new(AtomicUsize::new(0));
    let events = Arc::new(AtomicUsize::new(0));
    let db = Arc::new(db.clone());
    let servers = Arc::new(servers.to_vec());

    stream::iter(targets.into_iter().map(|(key_hex, identity)| {
        let (db, servers, bar, ok, fail, events) = (
            db.clone(),
            servers.clone(),
            bar.clone(),
            ok.clone(),
            fail.clone(),
            events.clone(),
        );
        tokio::spawn(async move {
            match push_system(&db, &key_hex, &servers).await {
                Ok(n) => {
                    // Mark the sent bundles pushed, then finalize the status.
                    let finalize = async {
                        mapping::mark_bundles_pushed(&db, &key_hex).await?;
                        mapping::mark_status(&db, &key_hex, "complete").await
                    };
                    match finalize.await {
                        Ok(()) => {
                            ok.fetch_add(1, Ordering::Relaxed);
                            events.fetch_add(n, Ordering::Relaxed);
                        }
                        Err(e) => {
                            fail.fetch_add(1, Ordering::Relaxed);
                            error!("pushed {identity} but failed to finalize: {e}");
                        }
                    }
                }
                Err(e) => {
                    fail.fetch_add(1, Ordering::Relaxed);
                    error!("failed to push {identity}: {e}");
                }
            }
            bar.inc(1);
            bar.set_message(format!(
                "✓{} ✗{} · {} events",
                ok.load(Ordering::Relaxed),
                fail.load(Ordering::Relaxed),
                fmt_count(events.load(Ordering::Relaxed) as u64),
            ));
        })
    }))
    .buffer_unordered(concurrency)
    .collect::<Vec<_>>()
    .await;

    let sent = ok.load(Ordering::Relaxed);
    let failed = fail.load(Ordering::Relaxed);
    bar.finish_with_message(format!("✓{sent} ✗{failed}"));
    println!(
        "push done: {sent} systems pushed, {failed} failed, {} events",
        fmt_count(events.load(Ordering::Relaxed) as u64)
    );
    if failed > 0 {
        return Err(format!("{failed} systems failed to push").into());
    }
    Ok(())
}

/// Push one system's persisted bundles to the servers, in order. Succeeds if at
/// least one server accepts every bundle. Returns the number of events sent.
async fn push_system(
    db: &sea_orm::DatabaseConnection,
    key_hex: &str,
    servers: &[String],
) -> Result<usize, String> {
    let encoded = mapping::load_unpushed_bundles(db, key_hex)
        .await
        .map_err(|e| format!("load bundles: {e}"))?;
    if encoded.is_empty() {
        // Nothing new to send (already pushed) - treat as success so the status
        // is finalized to `complete`.
        return Ok(0);
    }
    let bundles: Vec<EventBundle> = encoded
        .iter()
        .map(|b| EventBundle::decode(b.as_slice()))
        .collect::<Result<_, _>>()
        .map_err(|e| format!("decode bundle: {e}"))?;

    let mut pushed_any = false;
    for server in servers {
        let mut server_ok = true;
        for chunk in bundles.chunks(PUSH_CHUNK) {
            match polycentric::push(server, chunk.to_vec()).await {
                Ok(errors) if errors.is_empty() => {}
                Ok(errors) => {
                    warn!(
                        "{server} rejected {} events for {key_hex}: {errors:?}",
                        errors.len()
                    );
                    server_ok = false;
                    break;
                }
                Err(e) => {
                    warn!("push to {server} failed for {key_hex}: {e}");
                    server_ok = false;
                    break;
                }
            }
        }
        pushed_any |= server_ok;
    }
    if !pushed_any {
        return Err("failed to push to any server".to_string());
    }
    Ok(bundles.len())
}

# grayjay-migrator

Bridges legacy (v1) Polycentric systems (e.g. `srv1-gj.polycentric.io`) onto the
Harbor (v2) network.

The legacy DB is remote (high round-trip latency, near its connection limit), so
the tool works in two steps: **`sync-legacy`** copies the rows it needs into
local cache tables (`legacy_events_cache`, `legacy_opinions_cache`) in the
migrator's own database - one big transfer - and the migration then reads and
re-signs entirely from that local cache (fast, and safe to re-run):

```sh
# 1. one-time copy from the remote legacy DB into local cache tables
cargo run -p grayjay-migrator --bin grayjay-migrate -- sync-legacy
# 2. (optional) warm post link previews - resumable, run/repeat any time:
#    YouTube post links via the Data API (quota-based)…
cargo run -p grayjay-migrator --bin grayjay-migrate -- enrich-youtube
#    …and non-YouTube post links via the scraper
cargo run -p grayjay-migrator --bin grayjay-migrate -- scrape-links
# 3. re-sign: author every system locally (persists bundles + rows; no push)
cargo run -p grayjay-migrator --bin grayjay-migrate -- re-sign
# 4. push: send the authored bundles to the Harbor servers
cargo run -p grayjay-migrator --bin grayjay-migrate -- push
# inspect the link workload at any time
cargo run -p grayjay-migrator --bin grayjay-migrate -- stats
```

Diagnostics: `dump-links` prints the post links `scrape-links` has not cached
yet, and `probe-url <url>…` resolves the given URLs the way `scrape-links`
does and prints what it found. An unknown command is an error; no command
means `re-sign`.

`sync-legacy` needs `POLYCENTRIC_GRAYJAY_MIGRATOR_LEGACY_DATABASE_URL`; the
migrate step does not (it only reads the local cache). Opinions are copied
pre-deduplicated (latest per target) from the server's
`lww_element_latest_reference_*` tables, and only the mapped event types
(`POST`, `FOLLOW`, `USERNAME`, `DESCRIPTION`) are copied - so the cache is a
fraction of the full legacy database.

Two binaries share one crate:

- **`grayjay-migrate`** (`src/bin/migrate.rs`) - the one-shot migration tool. It
  reads the local cache (populated by `sync-legacy`), and for every legacy system:
  - derives a new v2 identity whose genesis document lists a single **master
    key** as the primary rotation key and the **legacy system key** as an
    additional rotation key (so the original owner can later reclaim it);
  - re-signs the system's posts and profile under that identity with the master
    key, preserving original timestamps;
  - pushes the events to the configured Harbor servers;
  - records the `legacy system_key -> v2 identity` mapping (idempotent - a
    re-run resumes, skipping systems already `complete`).
- **`grayjay-migrator`** (`src/main.rs`) - a long-running HTTP service exposing
  the lookup: `GET /identity/{legacy_system_key_hex}` -> `{ identity }`
  (404 if not migrated), plus `GET /healthz`.

Why one master key is safe: the v2 identity string is `SHA256(Identity)`, and
each genesis embeds that system's unique legacy key, so every migrated identity
is distinct even though one key signs them all.

## Configuration (environment)

Copy `.env.example` to `.env` for local runs. The tables below are read by
`src/config.rs`; the tables the tool and service use are created by the
`grayjay-migrator-migration` binary (every tool command also applies them on
start).

| Variable | Used by | Description |
| --- | --- | --- |
| `DATABASE_URL` | both | Migrator's own Postgres (holds the `migrated_identity` table). |
| `POLYCENTRIC_GRAYJAY_MIGRATOR_DATABASE_SCHEMA` | both | Schema for this service's tables (default `grayjay_migrator`). |
| `POLYCENTRIC_GRAYJAY_MIGRATOR_LEGACY_DATABASE_URL` | tool | Read-only URL for the legacy (v1) server's Postgres. |
| `POLYCENTRIC_GRAYJAY_MIGRATOR_SIGNING_KEY` | tool | Hex 32-byte ed25519 master seed. **High-value secret.** |
| `POLYCENTRIC_GRAYJAY_MIGRATOR_SERVERS` | tool | Comma-separated Harbor gRPC URLs to push to. Required only by `push`; `re-sign`, `scrape-links`, and `enrich-youtube` don't need it. |
| `POLYCENTRIC_GRAYJAY_MIGRATOR_IDENTITY_SERVERS` | tool | Comma-separated server URLs baked into each migrated identity document (`Identity.servers`) so clients know where to pull the account. Distinct from `SERVERS` (where the tool pushes). Empty leaves `servers` unset. **Changing it changes every identity string** (it's part of the hashed document), so set it before the run. |
| `POLYCENTRIC_GRAYJAY_MIGRATOR_YOUTUBE_API_KEY` | tool | YouTube Data API v3 key. When set, YouTube link previews (title/description/thumbnail) are resolved via the API in batches of 50 - quota-based, so it avoids the per-IP rate-limiting (HTTP 429) that page-scraping ~200k videos hits. ~4k quota units for the whole run (default quota 10k/day). Strongly recommended, since YouTube is the bulk of the links. |
| `POLYCENTRIC_GRAYJAY_MIGRATOR_HTTP_ADDR` | service | Lookup bind address (default `0.0.0.0:3003`). |
| `POLYCENTRIC_GRAYJAY_MIGRATOR_CONCURRENCY` | tool | How many systems to process in parallel, for both `re-sign` and `push` (default 32). |
| `POLYCENTRIC_GRAYJAY_MIGRATOR_MODERATION_DATABASE_URL` | seed | Harbor moderation Postgres, for `seed-moderation`. |
| `POLYCENTRIC_GRAYJAY_MIGRATOR_MODERATION_DATABASE_SCHEMA` | seed | Moderation schema (default `moderation`). |

## re-sign and push (append-only, continuously runnable)

Authoring and pushing are **two separate jobs**, so a slow or rate-limited
server never holds up signing, and you can verify locally before sending
anything:

```sh
# author every system's NEW events locally: appends the signed bundles + mapping
# rows onto each system's existing chain. Nothing is pushed. No SERVERS needed.
cargo run -p grayjay-migrator --bin grayjay-migrate -- re-sign
# send each system's UNPUSHED bundles to the Harbor servers, marking them pushed.
cargo run -p grayjay-migrator --bin grayjay-migrate -- push
```

Both jobs are **append-only**: to bring newly-arrived events onto the network,
copy them in with `sync-legacy` and re-run `re-sign` then `push` - only the new
events are authored and sent. `re-sign` authors just the events whose legacy
pointer isn't already in `migrated_event`, **resuming** each system's persisted
chain state (`migrated_chain`: genesis flag, per-collection sequence, last
signature, Merkle head) so new events append onto the existing chain instead of
re-signing it. New bundles are stored unpushed in `authored_bundle`; `push`
sends the unpushed ones and marks them pushed.

Status lifecycle per system: `pending` (planned) -> `signed` (has new authored
bundles awaiting push) -> `complete` (all pushed). **Push status never gates
appending** - a `complete` system that gains new events goes back to `signed`,
and `push` sends only its new bundles. `re-sign` skips systems with no new
events; `put_events` is idempotent, so a re-run after a partial push is safe.
Once a run is fully `complete`, `DELETE FROM authored_bundle WHERE pushed`
reclaims the bundle bytes (the chain can still be resumed from `migrated_chain`).
`re-sign` needs only `DATABASE_URL` + `SIGNING_KEY`; `push` needs `SERVERS`.

Reactions are de-duplicated per target URL: a like/dislike that was later
changed or retracted in the legacy CRDT yields at most one v2 reaction (or none
if retracted).

## Performance

Systems are migrated concurrently (each is independent - its own identity,
chain, and rows). Tune with `POLYCENTRIC_GRAYJAY_MIGRATOR_CONCURRENCY` (default
32). The DB connection pools are sized to `concurrency + 4`, so if you raise it
substantially make sure Postgres `max_connections` has room.

## Progress

On a terminal the tool shows two live progress bars - **prepare** (phase 1:
reading + planning every system, writing `pending` identity rows) and **author**
(phase 2: signing, pushing, and finalizing), the latter with running counts
(`✓ok ✗fail · Np Nr`). When stderr isn't a TTY (e.g. a Kubernetes Job) the bars
are suppressed and periodic `phase 1/2: prepared N/total` log lines are emitted
instead. Either way, `migrated_identity` fills during phase 1 and
`migrated_event` during phase 2, so you can also watch progress in the database.

## Scope

Grayjay posts and reactions are comments/opinions on **URLs**, so they map onto
v2's out-of-network attribution:

- **posts** -> `Post { text, attributed_to: [Link{url}], links, reply }`:
  - the topic the post commented on goes in `attributed_to`. Grayjay stores it
    as a full `http(s)` URL (~92%), a bare 11-char YouTube id (~5%, normalized
    to `https://www.youtube.com/watch?v=<id>`), another scheme URI (e.g.
    `lbry://…`, kept as-is), or a bare platform id (Rumble slug, hex, numeric,
    `video_episode:<uuid>`, …). Ids that can't be turned into a real URL are
    preserved as `grayjay://polycentric-legacy-ref/<raw>` so the attribution
    isn't lost and can be re-resolved later;
  - **only posts** (comments/replies) get real previews, populated **out of
    band** in a local `url_info_cache` table, so **authoring never scrapes
    inline** - it only reads the cache, and a miss yields a bare-URL `Link`
    (host-only card) with the topic still in `attributed_to`. Two steps fill the
    cache, both resumable and idempotent (already-cached URLs are skipped):
    - **`enrich-youtube`** - YouTube post links via the **YouTube Data API**
      (`POLYCENTRIC_GRAYJAY_MIGRATOR_YOUTUBE_API_KEY`, batched 50/call, 1 quota
      unit each) into real title/description/thumbnail - quota-based, so no
      per-IP rate-limiting (the scraper rate-limits YouTube to empty results,
      which is why YouTube never goes through it). Also runs automatically before
      authoring when a key is set, and stops after sustained quota failures.
    - **`scrape-links`** - every **non-YouTube** post `http(s)` link, resolved
      **directly from the migration host** (not the Harbor server's scraper,
      whose datacenter IP many video hosts - Twitch, BitChute, Kick, Dailymotion,
      Nebula - block or challenge, so it times out to empty). **Rumble** goes via
      its **oEmbed API**; everything else is fetched as a link-preview crawler and
      its `og:`/`twitter:` tags parsed (`src/og.rs`). Concurrent, batched,
      decoupled from authoring, resumable - empties stay uncached and retry next
      run. Only client-rendered pages with no server-side OG tags stay empty
      (they fall back to a bare link).

    A cached preview renders as Harbor's card (`PostContent` reads
    `post.links[0]`). Non-http topics are attribution-only regardless;
  - if the post was a reply, `reply` points at the **migrated** parent post's v2
    `EventKey` (resolved through the global legacy->v2 map built in phase 1);
- **reactions** (`OPINION`) -> `AttributedToReaction { attributed_to: Link{url, title: "Grayjay video"}, positive }`
  (reaction targets are never scraped - millions of video votes - so they carry a
  static title, not a resolved preview),
- **profile** (name/description) -> `ProfileUpdate`.
- **follows** (`FOLLOW`) -> `Follow { identity }` in `SOCIAL_GRAPH`. A follow's
  target is the followed system's key (in the `LWWElementSet` value); the latest
  add/remove per followed system wins, and only active follows are migrated. The
  followed key derives its v2 identity deterministically, so it points at the
  followed grayjay user's migrated identity.

Neither `scrape-links` nor authoring needs a Harbor server: `scrape-links`
fetches from the migration host directly, and authoring reads whatever
`scrape-links`/`enrich-youtube` already cached, with links that have no cached
preview falling back to just the URL.

Deferred, with documented extension points in `src/convert.rs`:
- images/avatars (need the v2 blob-upload flow),
- claims (map v1 `Claim` -> v2 `VerificationClaim`).

## Moderation carry-forward

Legacy events already carry the server's moderation results - a
`moderation_status` (`approved`, `flagged_and_rejected`, …) and
`moderation_tags` (`(category, level)`, e.g. `(hate,0) (self_harm,1)`). To avoid
re-running the (expensive) Azure/PhotoDNA scoring on the new servers, the
migrator records these per post on `migrated_event.moderation_status` /
`migrated_event.moderation_tags` (JSON), along with the v2
`content_digest_type`/`content_digest_bytes`. (Reactions/profiles aren't
content-moderated, so they carry none.)

### Preventing the new servers from reprocessing

The Harbor moderation worker dedupes on the **v2 content digest**: if
`processed_content` already has a row with an `azure_response`, it skips
Azure/PhotoDNA and re-derives the labels from that JSON. The `seed-moderation`
step pre-seeds those rows from the recorded verdicts, so migrated posts are
never re-scored:

```sh
POLYCENTRIC_GRAYJAY_MIGRATOR_MODERATION_DATABASE_URL=postgres://…/harbor \
  cargo run -p grayjay-migrator --bin grayjay-migrate -- seed-moderation
```

It reads `migrated_event` (posts with an `approved` / `flagged_and_rejected`
verdict), reconstructs an Azure-shaped `azure_response` from the legacy tags
(`hate`/`self_harm`/`sexual`/`violence` + level map 1:1 to the Azure
categories), and upserts one `SUCCESS` row per digest into `processed_content`
(`ON CONFLICT DO NOTHING`, so a genuine existing result is never clobbered). No
change to the moderation service is needed - it reuses its own skip path.

**Order matters:** the rows must exist before the worker sees the events. The
safe sequence is:

1. `re-sign` - populates `migrated_event` (digests are deterministic),
2. `seed-moderation` - seeds `processed_content`,
3. `push` - sends the events.

Note: CSAM (PhotoDNA) can't be distinguished from the Azure tags, so seeded rows
set `is_csam=false`. Legacy CSAM content was already purged and images aren't
migrated yet, so this is safe for the current scope.

## Re-runnability

The tool is safe to run repeatedly:

- ed25519 signing is deterministic, so re-authoring the same legacy content
  yields byte-identical v2 events that the Harbor servers dedupe.
- Every migrated legacy event is recorded in the **`migrated_event`** table
  (`legacy_system_key` + `legacy_pointer` -> v2 `identity`/`collection`/
  `sequence`/`signature`), and every system in **`migrated_identity`**. Systems
  marked `complete` are skipped on re-run; clear a system's rows to re-migrate
  it. This assumes the legacy data is frozen (append-only) during migration.

## Legacy schema

`src/legacy.rs` isolates the legacy SQL in constants (`EVENTS_TABLE`,
`COL_SYSTEM_KEY_TYPE`, `COL_SYSTEM_KEY`, `COL_RAW_EVENT`). Confirm these against
srv1-gj's actual schema before running the tool.

## Deploying

`deploy/charts/harbor-grayjay-migrator` runs the lookup service (a Deployment
behind a Service, with the schema migrations as a pre-install/pre-upgrade hook
Job). `deploy-grayjay-migrator-staging.yml` builds the image and publishes the
chart on a push to `develop`; `deploy-grayjay-migrator-production.yml` promotes
the staging tags. `DATABASE_URL` and the `POLYCENTRIC_GRAYJAY_MIGRATOR_*`
variables come from a Secret referenced through `envFrom`.

The image also ships `grayjay-migrate`, so the tool steps can run in-cluster
against the same database from the lookup pod once the Secret carries the
tool-only variables (`SIGNING_KEY`, `SERVERS`, `IDENTITY_SERVERS`,
`LEGACY_DATABASE_URL`, `YOUTUBE_API_KEY`):

```sh
kubectl exec -it deploy/harbor-grayjay-migrator -- /app/grayjay-migrate re-sign
kubectl exec -it deploy/harbor-grayjay-migrator -- /app/grayjay-migrate push
```

Without a TTY the progress bars are replaced by periodic log lines.

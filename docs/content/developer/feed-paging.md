---
title: Feed Paging
sidebar_label: Feed Paging
sidebar_position: 3
---

# Feed Paging

A feed is assembled from every server the client is configured with. Each
server returns its own ranked page and its own cursor. The client merges those
pages into one list, and extends that list as the reader scrolls.

The merge holds to one rule: **a post that has been shown keeps its position.**
Later pages, slow servers and changing reaction counts may add posts. They may
not move or remove the posts already on screen.

## Concepts

- **Pool.** Every post fetched so far, held in the per-server caches. The pool
  is ranked in full on every merge.
- **Window.** The part of the pool an emission carries, given as the
  `window_size` argument. Posts outside it are never sent to the app.
- **Anchor.** The previous emission. Posts in it keep their positions in the
  next one.

## Data flow

```text
   server A                      server B
      │  page (50 posts)            │  page (50 posts)
      ▼                             ▼
 ┌───────────┐                 ┌───────────┐
 │  cache A  │                 │  cache B  │   pages, kept as they arrived
 │  page 1   │                 │  page 1   │
 │  page 2   │                 │  page 2   │
 └─────┬─────┘                 └─────┬─────┘
       └──────────────┬──────────────┘
                      ▼
               do_feed_merge
      dedupe → validate → order → cut to `window_size`
                      │
                      ▼
                  emission ──► useQuery ──► feed hook ──► FeedList
```

The cache holds raw pages. The merge runs once per emission, over every page,
and it is the only step that cuts anything.

## Pool and window

The window is what the app receives. The rest of the pool stays in the core.

```text
ranked pool, newest merge
┌──────────────────────────────┬──────────────────────────────────┐
│ emitted: positions fixed     │ held back: reranked every merge  │
│ (window = 30)                │                                  │
└──────────────────────────────┴──────────────────────────────────┘
                               ▲
                               └── loadMore moves this line right by 15
```

Holding posts back is what makes a late page useful. A server that answers on
the second fan-out joins the ranking of everything not yet shown, so its best
posts appear at the reader's next step instead of at the end of the list.

```text
emitted   [ A  B  C ]      held back  [ E  G ]
server B answers with D, which outranks E
emitted   [ A  B  C ]      held back  [ D  E  G ]
                                        ▲
                                        the next loadMore shows D
```

## Ordering

`do_feed_merge` sorts the pool by four keys, in order:

1. Position in the anchor. Posts already emitted come first, in the order they
   were emitted.
2. Rank. `created_at` for Latest feeds. For Top, the decayed score
   `count / (hours + 2) ^ 1.8`, matching the server's `reaction_count_decay`
   function.
3. `created_at`.
4. Event key.

The last two are tie-breaks, so the result never depends on which server
answered first.

The merge then keeps the first `window_size` posts, and never fewer than the last
emission carried. If it held anything back it sets `has_next_page`, so the app
knows there is more to read even when every server is exhausted.

The anchor is held in `QueryState.emitted` and passed to the merge as
`previous`. Invalidating the query clears it. This is why pull-to-refresh
reorders a feed and paging never does.

## Fetching a page

1. The feed hook builds its `Query` with `limit: FEED_PAGE_SIZE`, the current
   `window_size`, and the `forwardToken` from the previous emission's
   `page_info`.
2. `QueryClient::fetch` calls every server in parallel.
3. Each response is folded into that server's cache entry.
4. When every server has answered, `EmitMode::Default` merges the caches,
   orders them, cuts to `window_size`, and emits.
5. The app decodes the emission and renders it.

Cursors are per server. `FakeCursorToken` packs one cursor per server into a
single token, so the app passes one `forwardToken` and each server still
receives its own.

## Constants

| Constant              | Value | Meaning                                       |
| --------------------- | ----- | --------------------------------------------- |
| `FEED_PAGE_SIZE`      | 50    | Posts requested from each server per page.    |
| `FEED_WINDOW_STEP`    | 15    | Posts added to the window by each `loadMore`. |
| `FEED_INITIAL_WINDOW` | 2 steps | Posts in the first emission.                |
| `MIN_REVEAL`          | 8     | New posts a `loadMore` aims to surface.       |
| `MAX_ROUNDS`          | 3     | Fan-outs one `loadMore` may chain.            |

The first three are defined in `feedCache.ts`, the last two in
`useChainedExtend.ts`.

`FEED_INITIAL_WINDOW` is two steps rather than one because the first window has
to satisfy the list, not only the screen. `FeedList` keeps requesting more until
it holds `onEndReachedThreshold` viewports past the screen, so a one-step first
window fires `onEndReached` on load and costs an extra round of fetches before
the reader has scrolled.

## Behaviour to be aware of

### Ranking applies once

A post that would rank first, but that arrives after the reader has passed that
position, is shown lower down. Ranking decides where a post enters the list,
not where it stays. Refresh is what reorders.

### Client and server ranking must agree

The client reorders what the servers send. If a server ranks by a different
measure, the client scatters that server's page, and the cursor, which follows
the server's order, pages through a sequence the list no longer reflects.
Change the ranking on both sides together, and deploy the servers first.

### Page size and window pull in opposite directions

A small `FEED_PAGE_SIZE` starves the ranking, because the merge has too few
candidates to choose between. A large window fixes the positions of posts the
reader never looked at, and sends the app a payload that grows with everything
fetched. Changing one means checking the other.

### A missing post is a deleted post

The merge drops posts that fail validation, whose author is blocked, or that
the servers stopped returning. The anchor fixes positions. It does not restore
posts that have left the pool.

### Merges run over the whole pool

`merge_fn` decodes every server's cached bytes on each emission, so its cost
grows with everything fetched, not with the newest page. Keep it to a single
pass, and avoid adding another walk over the merged list.

## Adding a feed

**1. Server.** Add the RPC to `protos/polycentric/v2/feeds.proto` returning
`GetFeedResponse`, and implement it in `services/server`. Rank a Top feed with
`reaction_count_decay`, and page with the shared cursor helpers.

**2. Core.** Add an args record, including `window_size`, and a query function
in `rs-core/src/query/feed.rs`. The query function requests one page per server,
calls `prepare_page_info` so the cursors survive the merge, copies bundles and
hints into the local store, and passes `validated_feed_merge(order, window_size)`
to `query_client.fetch`. Add a `Query` variant in `api.rs` and a match arm in
`fetch_query`.

**3. Bindings.** Regenerate with `pnpm -C packages/react-native ubrn:android`
for native and `pnpm -C packages/rs-core-wasm build` for web. A new `Query` variant
shifts the enum ordinals, so the JS bindings and the native library must ship
together.

**4. App.** Add a hook beside `useExploreFeed`. Build the args with
`FEED_PAGE_SIZE`, `windowSize: window.size` from `useFeedWindow`, and
`extractFeedToken`.
Decode with `useFeedWithOverlays`. Have `loadMore` call `window.increase()`
before the `useChainedExtend` request, and return a `FeedHookResult` so
`FeedList` renders it unchanged.

A feed built this way inherits the paging, the overlays that carry local
reaction state, and the ordering rule.

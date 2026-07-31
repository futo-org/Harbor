package org.futo.polycentric.core

import org.futo.polycentric.ffi.GetEventArgs
import org.futo.polycentric.ffi.GetExploreFeedArgs
import org.futo.polycentric.ffi.GetFollowingFeedArgs
import org.futo.polycentric.ffi.GetIdentityFeedArgs
import org.futo.polycentric.ffi.GetPostThreadArgs
import org.futo.polycentric.ffi.GetProfileArgs
import org.futo.polycentric.ffi.IsBannedArgs
import org.futo.polycentric.ffi.IsModeratorArgs
import org.futo.polycentric.ffi.ListBansArgs
import org.futo.polycentric.ffi.ListFollowersArgs
import org.futo.polycentric.ffi.ListFollowingArgs
import org.futo.polycentric.ffi.ListNotificationsArgs
import org.futo.polycentric.ffi.ListTargetedVerificationClaimsArgs
import org.futo.polycentric.ffi.ListVerificationClaimsArgs
import org.futo.polycentric.ffi.ListVerificationTargetsArgs
import org.futo.polycentric.ffi.ListVerificationVerifiesArgs
import org.futo.polycentric.ffi.Query
import org.futo.polycentric.ffi.QueryOpts
import polycentric.v2.EventBundle
import polycentric.v2.EventKey
import polycentric.v2.GetFeedResponse
import polycentric.v2.GetPostThreadResponse
import polycentric.v2.GetProfileResponse
import polycentric.v2.ListBansResponse
import polycentric.v2.ListFollowsResponse
import polycentric.v2.ListNotificationsResponse
import polycentric.v2.ListTargetedVerificationClaimsResponse
import polycentric.v2.ListVerificationClaimsResponse
import polycentric.v2.ListVerificationTargetsResponse
import polycentric.v2.ListVerificationVerifiesResponse

/**
 * Typed one-shot wrappers for every core `Query` variant except
 * `ListEvents`, which lives on [PolycentricClient.listEvents] (js-core
 * apps call `core.fetchQuery` with these directly; here each gets a
 * method). All fan out over the configured servers — except [listBans],
 * which is pinned to one server — and resolve on the first `Success`
 * status via [awaitQuery]; use [queryFlow] directly for live/observable
 * consumption.
 */


suspend fun PolycentricClient.getProfile(identity: String): GetProfileResponse? =
    core.awaitQuery(Query.GetProfile(GetProfileArgs(identity)))
        ?.let { GetProfileResponse.ADAPTER.decode(it) }

/** Returns the single event bundle for a key, or null when no server has it. */
suspend fun PolycentricClient.getEvent(
    identity: String,
    collection: Int,
    sequence: Long,
): EventBundle? =
    core.awaitQuery(Query.GetEvent(GetEventArgs(identity, collection, sequence.toULong())))
        ?.let { EventBundle.ADAPTER.decode(it) }

suspend fun PolycentricClient.getPostThread(
    postKey: EventKey,
    limit: Int = 50,
): GetPostThreadResponse? =
    core.awaitQuery(Query.GetPostThread(GetPostThreadArgs(postKey.toFfiOrThrow(), limit)))
        ?.let { GetPostThreadResponse.ADAPTER.decode(it) }

suspend fun PolycentricClient.getIdentityFeed(
    identity: String,
    limit: Int? = null,
    backwardToken: String? = null,
    forwardToken: String? = null,
): GetFeedResponse? =
    core.awaitQuery(
        Query.GetIdentityFeed(GetIdentityFeedArgs(identity, limit, backwardToken, forwardToken)),
    )?.let { GetFeedResponse.ADAPTER.decode(it) }

suspend fun PolycentricClient.getFollowingFeed(
    followerIdentity: String,
    limit: Int? = null,
    backwardToken: String? = null,
    forwardToken: String? = null,
): GetFeedResponse? =
    core.awaitQuery(
        Query.GetFollowingFeed(
            GetFollowingFeedArgs(followerIdentity, limit, backwardToken, forwardToken),
        ),
    )?.let { GetFeedResponse.ADAPTER.decode(it) }

suspend fun PolycentricClient.getExploreFeed(
    identity: String? = null,
    limit: Int? = null,
    backwardToken: String? = null,
    forwardToken: String? = null,
): GetFeedResponse? =
    core.awaitQuery(
        Query.GetExploreFeed(GetExploreFeedArgs(identity, limit, backwardToken, forwardToken)),
    )?.let { GetFeedResponse.ADAPTER.decode(it) }

suspend fun PolycentricClient.listNotifications(
    identity: String,
    first: Int? = null,
    after: String? = null,
    omitLabels: List<String> = emptyList(),
): ListNotificationsResponse? =
    core.awaitQuery(
        Query.ListNotifications(ListNotificationsArgs(identity, first?.toUInt(), after, omitLabels)),
    )?.let { ListNotificationsResponse.ADAPTER.decode(it) }

suspend fun PolycentricClient.listFollowing(
    identity: String,
    limit: Int? = null,
    backwardToken: String? = null,
    forwardToken: String? = null,
): ListFollowsResponse? =
    core.awaitQuery(
        Query.ListFollowing(ListFollowingArgs(identity, limit, backwardToken, forwardToken)),
    )?.let { ListFollowsResponse.ADAPTER.decode(it) }

suspend fun PolycentricClient.listFollowers(
    identity: String,
    limit: Int? = null,
    backwardToken: String? = null,
    forwardToken: String? = null,
): ListFollowsResponse? =
    core.awaitQuery(
        Query.ListFollowers(ListFollowersArgs(identity, limit, backwardToken, forwardToken)),
    )?.let { ListFollowsResponse.ADAPTER.decode(it) }

suspend fun PolycentricClient.listVerificationClaims(
    claimedByIdentity: String,
): ListVerificationClaimsResponse? =
    core.awaitQuery(
        Query.ListVerificationClaims(ListVerificationClaimsArgs(claimedByIdentity)),
    )?.let { ListVerificationClaimsResponse.ADAPTER.decode(it) }

suspend fun PolycentricClient.listVerificationTargets(
    claimEventKey: EventKey,
): ListVerificationTargetsResponse? =
    core.awaitQuery(
        Query.ListVerificationTargets(ListVerificationTargetsArgs(claimEventKey.toFfiOrThrow())),
    )?.let { ListVerificationTargetsResponse.ADAPTER.decode(it) }

suspend fun PolycentricClient.listVerificationVerifies(
    claimEventKey: EventKey,
): ListVerificationVerifiesResponse? =
    core.awaitQuery(
        Query.ListVerificationVerifies(ListVerificationVerifiesArgs(claimEventKey.toFfiOrThrow())),
    )?.let { ListVerificationVerifiesResponse.ADAPTER.decode(it) }

suspend fun PolycentricClient.listTargetedVerificationClaims(
    targetIdentity: String,
): ListTargetedVerificationClaimsResponse? =
    core.awaitQuery(
        Query.ListTargetedVerificationClaims(ListTargetedVerificationClaimsArgs(targetIdentity)),
    )?.let { ListTargetedVerificationClaimsResponse.ADAPTER.decode(it) }

/**
 * For each configured server, whether the authenticated caller is a
 * moderator there. Requires the auth token provider to be minting
 * tokens (an active identity); servers that fail to respond are absent
 * from the map.
 */
suspend fun PolycentricClient.isModerator(): Map<String, Boolean> =
    core.awaitQuery(Query.IsModerator(IsModeratorArgs()))
        ?.let { Moderation.decodeStatusByServer(it) } ?: emptyMap()

/** For each configured server, whether `targetIdentity` is banned there. */
suspend fun PolycentricClient.isBanned(targetIdentity: String): Map<String, Boolean> =
    core.awaitQuery(Query.IsBanned(IsBannedArgs(targetIdentity)))
        ?.let { Moderation.decodeStatusByServer(it) } ?: emptyMap()

/**
 * Page through the identities banned on a single server. Pagination only
 * makes sense per server, so the query is pinned to [server] (and the
 * query key scoped by it) rather than fanned out — same contract the
 * rust core documents for `Query.ListBans`.
 */
suspend fun PolycentricClient.listBans(
    server: String,
    limit: Int? = null,
    after: String? = null,
    query: String? = null,
): ListBansResponse? =
    core.awaitQuery(
        Query.ListBans(ListBansArgs(limit?.toUInt(), after, query)),
        queryKey = listOf("list_bans", server, after ?: "", query ?: ""),
        opts = QueryOpts(fetchMode = null, updateMode = null, servers = listOf(server)),
    )?.let { ListBansResponse.ADAPTER.decode(it) }

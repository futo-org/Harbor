package org.futo.polycentric.core

import org.futo.polycentric.ffi.GetEventArgs
import org.futo.polycentric.ffi.GetExploreFeedArgs
import org.futo.polycentric.ffi.GetFollowingFeedArgs
import org.futo.polycentric.ffi.GetIdentityFeedArgs
import org.futo.polycentric.ffi.GetPostThreadArgs
import org.futo.polycentric.ffi.GetProfileArgs
import org.futo.polycentric.ffi.ListFollowersArgs
import org.futo.polycentric.ffi.ListFollowingArgs
import org.futo.polycentric.ffi.ListNotificationsArgs
import org.futo.polycentric.ffi.ListTargetedVerificationClaimsArgs
import org.futo.polycentric.ffi.ListVerificationClaimsArgs
import org.futo.polycentric.ffi.ListVerificationTargetsArgs
import org.futo.polycentric.ffi.ListVerificationVerifiesArgs
import org.futo.polycentric.ffi.Query
import polycentric.v2.EventBundle
import polycentric.v2.EventKey
import polycentric.v2.GetFeedResponse
import polycentric.v2.GetPostThreadResponse
import polycentric.v2.GetProfileResponse
import polycentric.v2.ListFollowsResponse
import polycentric.v2.ListNotificationsResponse
import polycentric.v2.ListTargetedVerificationClaimsResponse
import polycentric.v2.ListVerificationClaimsResponse
import polycentric.v2.ListVerificationTargetsResponse
import polycentric.v2.ListVerificationVerifiesResponse

/**
 * Typed one-shot wrappers for every core `Query` variant (js-core apps
 * call `core.fetchQuery` with these directly; here each gets a method).
 * All fan out over the configured servers and resolve on the first
 * `Success` status via [awaitQuery]; use [queryFlow] directly for
 * live/observable consumption.
 *
 * `ListEvents` is on [PolycentricClient.listEvents].
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

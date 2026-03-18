package tech.futo.libPolycentric.queries

import okio.ByteString
import okio.ByteString.Companion.toByteString
import polycentric.ContentType
import polycentric_ffi.Option
import polycentric.Event
import polycentric.EventKey
import polycentric.Events
import polycentric.FeedResult
import polycentric.ImageManifest
import polycentric.LWWElement
import polycentric.Pointer
import polycentric.PublicKey
import polycentric.Reference
import polycentric_ffi.FeedQuery as FFIFeedQuery
import polycentric_ffi.SearchQuery
import polycentric_ffi.SearchType
import polycentric_ffi.ServerFeedQuery
import tech.futo.libPolycentric.PolycentricClient

class QueryManager(private val client: PolycentricClient) {

    fun queryExploreFeed(
        perServerLimit: Long? = null,
        moderationFilters: String? = null,
    ): FeedQuery {
        val currentSystemBytes = PublicKey.ADAPTER.encode(
            client.currentIdentity.keyPair.publicKey
        )

        val feedQuery = ServerFeedQuery(
            per_server_limit = perServerLimit,
            moderation_filters = moderationFilters,
        )
        val feedQueryBytes = ServerFeedQuery.ADAPTER.encode(feedQuery)

        return FeedQuery(client) { cursor ->
            client.ffiService.queryExploreFeed(currentSystemBytes, feedQueryBytes, cursor)
        }
    }

    fun querySearchFeed(
        searchQuery: String,
        searchType: String? = null,
        perServerLimit: Long? = null,
        moderationFilters: String? = null,
    ): FeedQuery {
        val currentSystemBytes = PublicKey.ADAPTER.encode(
            client.currentIdentity.keyPair.publicKey
        )

        val feedQuery = ServerFeedQuery(
            per_server_limit = perServerLimit,
            moderation_filters = moderationFilters,
        )
        val feedQueryBytes = ServerFeedQuery.ADAPTER.encode(feedQuery)

        val search = SearchQuery(
            query = searchQuery,
            type = when (searchType) {
                "profiles" -> SearchType.profiles
                else -> SearchType.messages
            },
        )
        val searchQueryBytes = SearchQuery.ADAPTER.encode(search)

        return FeedQuery(client) { cursor ->
            client.ffiService.querySearchFeed(currentSystemBytes, feedQueryBytes, searchQueryBytes, cursor)
        }
    }

    fun queryFollowingFeed(limit: Int): FeedQuery {
        val currentSystemBytes = PublicKey.ADAPTER.encode(
            client.currentIdentity.keyPair.publicKey
        )

        return FeedQuery(client) { cursor ->
            client.ffiService.queryFollowingFeed(currentSystemBytes, limit, cursor)
        }
    }

    fun queryAuthorFeed(profile: PublicKey, limit: Int): FeedQuery {
        val currentSystemBytes = PublicKey.ADAPTER.encode(
            client.currentIdentity.keyPair.publicKey
        )
        val profileBytes = PublicKey.ADAPTER.encode(profile)

        return FeedQuery(client) { cursor ->
            client.ffiService.queryAuthorFeed(currentSystemBytes, profileBytes, limit, cursor)
        }
    }

    fun queryReferencesFeed(
        reference: Reference,
        moderationFilters: String? = null,
    ): FeedQuery {
        val currentSystemBytes = PublicKey.ADAPTER.encode(
            client.currentIdentity.keyPair.publicKey
        )

        val feedQuery = ServerFeedQuery(
            moderation_filters = moderationFilters,
        )
        val feedQueryBytes = ServerFeedQuery.ADAPTER.encode(feedQuery)
        val referenceBytes = Reference.ADAPTER.encode(reference)

        return FeedQuery(client) { cursor ->
            client.ffiService.queryReferencesFeed(currentSystemBytes, feedQueryBytes, referenceBytes, cursor)
        }
    }

    fun queryLikesFeed(limit: Int): FeedQuery {
        val currentSystemBytes = PublicKey.ADAPTER.encode(
            client.currentIdentity.keyPair.publicKey
        )

        return FeedQuery(client) { cursor ->
            client.ffiService.queryLikesFeed(currentSystemBytes, limit, cursor)
        }
    }

    fun queryCommentsFeed(moderationFilters: String? = null): FeedQuery {
        val currentSystemBytes = PublicKey.ADAPTER.encode(
            client.currentIdentity.keyPair.publicKey
        )

        val feedQuery = ServerFeedQuery(
            moderation_filters = moderationFilters,
        )
        val feedQueryBytes = ServerFeedQuery.ADAPTER.encode(feedQuery)

        return FeedQuery(client) { cursor ->
            client.ffiService.queryCommentsFeed(currentSystemBytes, feedQueryBytes, cursor)
        }
    }

    suspend fun queryCurrentOpinion(targetPointer: Pointer): LWWElement? {
        val currentSystemBytes = PublicKey.ADAPTER.encode(
            client.currentIdentity.keyPair.publicKey
        )
        val targetPointerBytes = Pointer.ADAPTER.encode(targetPointer)

        val result = client.ffiService.queryOpinion(currentSystemBytes, targetPointerBytes)
        if (result.isEmpty()) return null

        val option = Option.ADAPTER.decode(result)
        val valueBytes = option.value_ ?: return null

        return LWWElement.ADAPTER.decode(valueBytes.toByteArray())
    }

    suspend fun queryIsDeleted(targetPointer: Pointer): Boolean {
        val result = client.ffiService.queryEventIsDeleted(
            Pointer.ADAPTER.encode(targetPointer)
        )
        return result.isNotEmpty() && result[0] == 1.toByte()
    }

    suspend fun queryFeed(
        system: PublicKey,
        startTime: Long? = null,
        endTime: Long? = null,
        limit: Long? = null,
        cursor: ByteArray? = null,
    ): FeedResult {
        val feedQuery = FFIFeedQuery(
            system_bytes = PublicKey.ADAPTER.encode(system).toByteString(),
            start_time = startTime,
            end_time = endTime,
            limit = limit,
            cursor = cursor?.toByteString(),
        )
        val feedQueryBytes = FFIFeedQuery.ADAPTER.encode(feedQuery)

        val result = client.ffiService.queryFeedWithCursor(feedQueryBytes)
        if (result.isEmpty()) {
            return FeedResult(events = emptyList(), cursor = ByteString.EMPTY)
        }
        return FeedResult.ADAPTER.decode(result)
    }

    suspend fun queryUsername(system: PublicKey): String? {
        val lwwElement = querySystemCRDT(ContentType.USERNAME, system) ?: return null
        return lwwElement.value_.toByteArray().decodeToString()
    }

    suspend fun queryDescription(system: PublicKey): String? {
        val lwwElement = querySystemCRDT(ContentType.DESCRIPTION, system) ?: return null
        return lwwElement.value_.toByteArray().decodeToString()
    }

    suspend fun queryAvatar(system: PublicKey): ImageManifest? {
        val lwwElement = querySystemCRDT(ContentType.AVATAR, system) ?: return null
        return ImageManifest.ADAPTER.decode(lwwElement.value_.toByteArray())
    }

    suspend fun queryBanner(system: PublicKey): ImageManifest? {
        val lwwElement = querySystemCRDT(ContentType.BANNER, system) ?: return null
        return ImageManifest.ADAPTER.decode(lwwElement.value_.toByteArray())
    }

    suspend fun queryFollows(system: PublicKey): List<PublicKey> {
        val systemBytes = PublicKey.ADAPTER.encode(system)
        val result = client.ffiService.queryFollowsForSystem(systemBytes)
        if (result.isEmpty()) return emptyList()

        return extractPublicKeysFromLWWSetEvents(result)
    }

    suspend fun queryBlocks(system: PublicKey): List<PublicKey> {
        val systemBytes = PublicKey.ADAPTER.encode(system)
        val result = client.ffiService.queryBlocksForSystem(systemBytes)
        if (result.isEmpty()) return emptyList()

        return extractPublicKeysFromLWWSetEvents(result)
    }

    suspend fun queryServers(system: PublicKey): List<String> {
        val systemBytes = PublicKey.ADAPTER.encode(system)
        val result = client.ffiService.queryServersForSystem(systemBytes)
        if (result.isEmpty()) return emptyList()

        return extractStringsFromLWWSetEvents(result)
    }

    suspend fun queryAuthorities(system: PublicKey): List<String> {
        val systemBytes = PublicKey.ADAPTER.encode(system)
        val result = client.ffiService.queryAuthoritiesForSystem(systemBytes)
        if (result.isEmpty()) return emptyList()

        return extractStringsFromLWWSetEvents(result)
    }

    suspend fun queryTopics(system: PublicKey): List<String> {
        val systemBytes = PublicKey.ADAPTER.encode(system)
        val result = client.ffiService.queryTopicsForSystem(systemBytes)
        if (result.isEmpty()) return emptyList()

        return extractStringsFromLWWSetEvents(result)
    }

    suspend fun eventPointer(event: Event): Pointer {
        val eventBytes = Event.ADAPTER.encode(event)
        val pointerBytes = client.ffiService.getPointer(eventBytes)
        return Pointer.ADAPTER.decode(pointerBytes)
    }

    suspend fun eventKey(event: Event): EventKey {
        val pointer = eventPointer(event)
        val pointerBytes = Pointer.ADAPTER.encode(pointer)
        val eventKeyBytes = client.ffiService.getReference(pointerBytes)
        require(eventKeyBytes.isNotEmpty()) { "Event is missing required fields" }
        return EventKey.ADAPTER.decode(eventKeyBytes)
    }

    private suspend fun querySystemCRDT(contentType: ContentType, system: PublicKey): LWWElement? {
        val currentSystemBytes = PublicKey.ADAPTER.encode(
            client.currentIdentity.keyPair.publicKey
        )
        val systemBytes = PublicKey.ADAPTER.encode(system)

        val result = client.ffiService.queryCrdtForSystem(
            systemBytes, contentType.value, currentSystemBytes,
        )
        if (result.isEmpty()) return null

        val option = Option.ADAPTER.decode(result)
        val valueBytes = option.value_ ?: return null

        return LWWElement.ADAPTER.decode(valueBytes.toByteArray())
    }

    private fun extractPublicKeysFromLWWSetEvents(resultBytes: ByteArray): List<PublicKey> {
        val events = Events.ADAPTER.decode(resultBytes)
        return events.events.mapNotNull { signedEvent ->
            val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
            val lwwElementSet = event.lww_element_set ?: return@mapNotNull null
            PublicKey.ADAPTER.decode(lwwElementSet.value_.toByteArray())
        }
    }

    private fun extractStringsFromLWWSetEvents(resultBytes: ByteArray): List<String> {
        val events = Events.ADAPTER.decode(resultBytes)
        return events.events.mapNotNull { signedEvent ->
            val event = Event.ADAPTER.decode(signedEvent.event.toByteArray())
            val lwwElementSet = event.lww_element_set ?: return@mapNotNull null
            lwwElementSet.value_.toByteArray().decodeToString()
        }
    }

}

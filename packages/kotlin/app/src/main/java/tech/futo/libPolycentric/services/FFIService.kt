package tech.futo.libPolycentric.services

import PolycentricException
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.http.HttpMethod
import io.ktor.http.appendPathSegments
import okio.ByteString
import okio.ByteString.Companion.toByteString
import polycentric_ffi.NetworkRequestResponse
import polycentric_ffi.NetworkRequestResponses
import polycentric_ffi.NetworkResponse
import polycentric_ffi.Result
import tech.futo.libPolycentric.PolycentricClient

public open class FFIException(message: String) : PolycentricException(message)

class FFIService(private val client: PolycentricClient){
    companion object {
        init {
            System.loadLibrary("jni_bindings")
        }
    }

    private suspend fun ffiResult(callback: (networkRequests: ByteArray) -> ByteArray): ByteArray {
        var requests = NetworkRequestResponses()

        for(i in 0..100) {
            val resultBytes = callback(NetworkRequestResponses.ADAPTER.encode(requests))
            val resultProtobuf = Result.ADAPTER.decode(resultBytes)

            if (resultProtobuf.requests !== null) {
                requests = resultProtobuf.requests
                requests = this.client.network.fulfillRequests(requests)
                continue
            }

            if (resultProtobuf.error !== null) {
                throw PolycentricException(resultProtobuf.error)
            }

            if (resultProtobuf.value_ !== null) {
                return resultProtobuf.value_.toByteArray()
            }
        }

        throw FFIException("FFI Boundary network request limit exceeded")
    }

    public suspend fun init(): ByteArray {
        return this.ffiResult { this.initialize() }
    }

    public suspend fun isInitialized(): ByteArray {
        return this.ffiResult { this.is_initialized() }
    }

    public suspend fun ingestEvent(signedEvent: ByteArray): ByteArray {
        return this.ffiResult { this.ingest_event(signedEvent) }
    }

    public suspend fun createEvent(eventCreationData: ByteArray, unixMs: Long): ByteArray {
        return this.ffiResult { this.create_event(eventCreationData, unixMs) }
    }

    public suspend fun syncEventsForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.sync_events_for_system(system, networkRequests) }
    }

    public suspend fun getReference(pointer: ByteArray): ByteArray {
        return this.ffiResult { this.get_reference(pointer) }
    }

    public suspend fun getPointer(event: ByteArray): ByteArray {
        return this.ffiResult { this.get_pointer(event) }
    }

    public suspend fun queryExploreFeed(system: ByteArray, feedQuery: ByteArray, cursor: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_explore_feed(system, networkRequests, feedQuery, cursor) }
    }

    public suspend fun querySearchFeed(system: ByteArray, feedQuery: ByteArray, searchQuery: ByteArray, cursor: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_search_feed(system, networkRequests, feedQuery, searchQuery, cursor) }
    }

    public suspend fun queryAuthorFeed(currentSystem: ByteArray, targetSystem: ByteArray, limit: Int, cursor: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_author_feed(currentSystem, targetSystem, networkRequests, limit, cursor) }
    }

    public suspend fun queryFollowingFeed(currentSystem: ByteArray, limit: Int, cursor: ByteArray): ByteArray {
        return this.ffiResult { this.query_following_feed(currentSystem, limit, cursor) }
    }

    public suspend fun queryReferencesFeed(system: ByteArray, feedQuery: ByteArray, reference: ByteArray, cursor: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_references_feed(system, networkRequests, feedQuery, reference, cursor) }
    }

    public suspend fun queryCommentsFeed(system: ByteArray, feedQuery: ByteArray, cursor: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_comments_feed(system, networkRequests, feedQuery, cursor) }
    }

    public suspend fun queryLikesFeed(currentSystem: ByteArray, limit: Int, cursor: ByteArray): ByteArray {
        return this.ffiResult { this.query_likes_feed(currentSystem, limit, cursor) }
    }

    public suspend fun queryEvents(system: ByteArray, process: ByteArray, startClock: Int, endClock: Int): ByteArray {
        return this.ffiResult { this.query_events(system, process, startClock, endClock) }
    }

    public suspend fun queryCrdtForSystem(targetSystem: ByteArray, contentType: Int, currentSystem: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_crdt_for_system(targetSystem, contentType, currentSystem, networkRequests) }
    }

    public suspend fun queryOpinion(currentSystem: ByteArray, targetPointer: ByteArray): ByteArray {
        return this.ffiResult { this.query_opinion(currentSystem, targetPointer) }
    }

    public suspend fun queryEventIsDeleted(pointer: ByteArray): ByteArray {
        return this.ffiResult { this.query_event_is_deleted(pointer) }
    }

    public suspend fun queryFollowsForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { this.query_follows_for_system(system) }
    }

    public suspend fun queryBlocksForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { this.query_blocks_for_system(system) }
    }

    public suspend fun queryServersForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { this.query_servers_for_system(system) }
    }

    public suspend fun queryAuthoritiesForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { this.query_authorities_for_system(system) }
    }

    public suspend fun queryTopicsForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { this.query_topics_for_system(system) }
    }

    public suspend fun queryFeedWithCursor(feedQuery: ByteArray): ByteArray {
        return this.ffiResult { this.query_feed_with_cursor(feedQuery) }
    }

    private external fun initialize(): ByteArray
    private external fun is_initialized(): ByteArray
    private external fun ingest_event(signed_event: ByteArray): ByteArray
    private external fun create_event(event_creation_data: ByteArray, unix_ms: Long): ByteArray
    private external fun sync_events_for_system(system: ByteArray, network_requests: ByteArray): ByteArray
    private external fun get_reference(pointer: ByteArray): ByteArray
    private external fun get_pointer(event: ByteArray): ByteArray
    private external fun query_explore_feed(system: ByteArray, network_requests: ByteArray, feed_query: ByteArray, cursor: ByteArray): ByteArray
    private external fun query_search_feed(system: ByteArray, network_requests: ByteArray, feed_query: ByteArray, search_query: ByteArray, cursor: ByteArray): ByteArray
    private external fun query_author_feed(current_system: ByteArray, target_system: ByteArray, network_requests: ByteArray, limit: Int, cursor: ByteArray): ByteArray
    private external fun query_following_feed(current_system: ByteArray, limit: Int, cursor: ByteArray): ByteArray
    private external fun query_references_feed(system: ByteArray, network_requests: ByteArray, feed_query: ByteArray, reference: ByteArray, cursor: ByteArray): ByteArray
    private external fun query_comments_feed(system: ByteArray, network_requests: ByteArray, feed_query: ByteArray, cursor: ByteArray): ByteArray
    private external fun query_likes_feed(current_system: ByteArray, limit: Int, cursor: ByteArray): ByteArray
    private external fun query_events(system: ByteArray, process: ByteArray, start_clock: Int, end_clock: Int): ByteArray
    private external fun query_crdt_for_system(target_system: ByteArray, content_type: Int, current_system: ByteArray, network_requests: ByteArray): ByteArray
    private external fun query_opinion(current_system: ByteArray, target_pointer: ByteArray): ByteArray
    private external fun query_event_is_deleted(pointer: ByteArray): ByteArray
    private external fun query_follows_for_system(system: ByteArray): ByteArray
    private external fun query_blocks_for_system(system: ByteArray): ByteArray
    private external fun query_servers_for_system(system: ByteArray): ByteArray
    private external fun query_authorities_for_system(system: ByteArray): ByteArray
    private external fun query_topics_for_system(system: ByteArray): ByteArray
    private external fun query_feed_with_cursor(feed_query: ByteArray): ByteArray
}

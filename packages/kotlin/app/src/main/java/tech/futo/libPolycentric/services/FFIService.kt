package tech.futo.libPolycentric.services

import PolycentricException
import polycentric_ffi.NetworkRequestResponses
import polycentric_ffi.Result

public open class FFIException(message: String) : PolycentricException(message)

class FFIService {
    companion object {
        init {
            System.loadLibrary("jni_bindings")
        }
    }

    private fun fulfillRequests(requests: NetworkRequestResponses) {
        for(pair in requests.pairs) {
            if(pair.response !== null) continue


        }
    }

    private fun ffiResult(callback: (networkRequests: ByteArray) -> ByteArray): ByteArray {
        var requests = NetworkRequestResponses()

        for(i in 0..100) {
            val resultBytes = callback(NetworkRequestResponses.ADAPTER.encode(requests))
            val resultProtobuf = Result.ADAPTER.decode(resultBytes)

            if (resultProtobuf.requests !== null) {
                requests = resultProtobuf.requests
                fulfillRequests(requests) // TODO inject this somehow
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

    public fun init(): ByteArray {
        return this.ffiResult { this.initialize() }
    }

    public fun isInitialized(): ByteArray {
        return this.ffiResult { this.is_initialized() }
    }

    public fun ingestEvent(signedEvent: ByteArray): ByteArray {
        return this.ffiResult { this.ingest_event(signedEvent) }
    }

    public fun createEvent(eventCreationData: ByteArray, unixMs: Int): ByteArray {
        return this.ffiResult { this.create_event(eventCreationData, unixMs) }
    }

    public fun syncEventsForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.sync_events_for_system(system, networkRequests) }
    }

    public fun getReference(pointer: ByteArray): ByteArray {
        return this.ffiResult { this.get_reference(pointer) }
    }

    public fun getPointer(event: ByteArray): ByteArray {
        return this.ffiResult { this.get_pointer(event) }
    }

    public fun queryExploreFeed(system: ByteArray, feedQuery: ByteArray, cursor: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_explore_feed(system, networkRequests, feedQuery, cursor) }
    }

    public fun querySearchFeed(system: ByteArray, feedQuery: ByteArray, searchQuery: ByteArray, cursor: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_search_feed(system, networkRequests, feedQuery, searchQuery, cursor) }
    }

    public fun queryAuthorFeed(currentSystem: ByteArray, targetSystem: ByteArray, limit: Int, cursor: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_author_feed(currentSystem, targetSystem, networkRequests, limit, cursor) }
    }

    public fun queryFollowingFeed(currentSystem: ByteArray, limit: Int, cursor: ByteArray): ByteArray {
        return this.ffiResult { this.query_following_feed(currentSystem, limit, cursor) }
    }

    public fun queryReferencesFeed(system: ByteArray, feedQuery: ByteArray, reference: ByteArray, cursor: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_references_feed(system, networkRequests, feedQuery, reference, cursor) }
    }

    public fun queryCommentsFeed(system: ByteArray, feedQuery: ByteArray, cursor: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_comments_feed(system, networkRequests, feedQuery, cursor) }
    }

    public fun queryLikesFeed(currentSystem: ByteArray, limit: Int, cursor: ByteArray): ByteArray {
        return this.ffiResult { this.query_likes_feed(currentSystem, limit, cursor) }
    }

    public fun queryEvents(system: ByteArray, process: ByteArray, startClock: Int, endClock: Int): ByteArray {
        return this.ffiResult { this.query_events(system, process, startClock, endClock) }
    }

    public fun queryCrdtForSystem(targetSystem: ByteArray, contentType: Int, currentSystem: ByteArray): ByteArray {
        return this.ffiResult { networkRequests -> this.query_crdt_for_system(targetSystem, contentType, currentSystem, networkRequests) }
    }

    public fun queryOpinion(currentSystem: ByteArray, targetPointer: ByteArray): ByteArray {
        return this.ffiResult { this.query_opinion(currentSystem, targetPointer) }
    }

    public fun queryEventIsDeleted(pointer: ByteArray): ByteArray {
        return this.ffiResult { this.query_event_is_deleted(pointer) }
    }

    public fun queryFollowsForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { this.query_follows_for_system(system) }
    }

    public fun queryBlocksForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { this.query_blocks_for_system(system) }
    }

    public fun queryServersForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { this.query_servers_for_system(system) }
    }

    public fun queryAuthoritiesForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { this.query_authorities_for_system(system) }
    }

    public fun queryTopicsForSystem(system: ByteArray): ByteArray {
        return this.ffiResult { this.query_topics_for_system(system) }
    }

    public fun queryFeedWithCursor(feedQuery: ByteArray): ByteArray {
        return this.ffiResult { this.query_feed_with_cursor(feedQuery) }
    }

    private external fun initialize(): ByteArray
    private external fun is_initialized(): ByteArray
    private external fun ingest_event(signed_event: ByteArray): ByteArray
    private external fun create_event(event_creation_data: ByteArray, unix_ms: Int): ByteArray
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

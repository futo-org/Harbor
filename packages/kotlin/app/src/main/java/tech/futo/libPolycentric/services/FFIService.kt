package tech.futo.libPolycentric.services

import polycentric_ffi.NetworkRequestResponses
import polycentric_ffi.Result

class FFIService {
    companion object {
        init {
            System.loadLibrary("jni_bindings")
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

        throw PolycentricException("FFI Boundary network request limit exceeded")
    }

    external fun initialize(): ByteArray
    external fun is_initialized(): ByteArray
    external fun ingest_event(signed_event: ByteArray): ByteArray
    external fun create_event(event_creation_data: ByteArray, unix_ms: Int): ByteArray
    external fun sync_events_for_system(system: ByteArray, network_requests: ByteArray): ByteArray
    external fun get_reference(pointer: ByteArray): ByteArray
    external fun get_pointer(event: ByteArray): ByteArray
    external fun query_explore_feed(system: ByteArray, network_requests: ByteArray, feed_query: ByteArray, cursor: ByteArray): ByteArray
    external fun query_search_feed(system: ByteArray, network_requests: ByteArray, feed_query: ByteArray, search_query: ByteArray, cursor: ByteArray): ByteArray
    external fun query_author_feed(current_system: ByteArray, target_system: ByteArray, network_requests: ByteArray, limit: Int, cursor: ByteArray): ByteArray
    external fun query_following_feed(current_system: ByteArray, limit: Int, cursor: ByteArray): ByteArray
    external fun query_references_feed(system: ByteArray, network_requests: ByteArray, feed_query: ByteArray, reference: ByteArray, cursor: ByteArray): ByteArray
    external fun query_comments_feed(system: ByteArray, network_requests: ByteArray, feed_query: ByteArray, cursor: ByteArray): ByteArray
    external fun query_likes_feed(current_system: ByteArray, limit: Int, cursor: ByteArray): ByteArray
    external fun query_events(system: ByteArray, process: ByteArray, start_clock: Int, end_clock: Int): ByteArray
    external fun query_crdt_for_system(target_system: ByteArray, content_type: Int, current_system: ByteArray, network_requests: ByteArray): ByteArray
    external fun query_opinion(current_system: ByteArray, target_pointer: ByteArray): ByteArray
    external fun query_event_is_deleted(pointer: ByteArray): ByteArray
    external fun query_follows_for_system(system: ByteArray): ByteArray
    external fun query_blocks_for_system(system: ByteArray): ByteArray
    external fun query_servers_for_system(system: ByteArray): ByteArray
    external fun query_authorities_for_system(system: ByteArray): ByteArray
    external fun query_topics_for_system(system: ByteArray): ByteArray
    external fun query_feed_with_cursor(feed_query: ByteArray): ByteArray
}

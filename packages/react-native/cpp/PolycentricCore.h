#pragma once

#include <PolycentricSpecJSI.h>
#include <jsi/jsi.h>
#include <memory>
#include <string>

// rust ffi types
extern "C" {
    struct CBuffer {
        const uint8_t* bytes;
        int length;
    };

    CBuffer initialize();
    CBuffer is_initialized();
    CBuffer create_event(CBuffer event_creation_data, unsigned long unix_ms);
    CBuffer ingest_event(CBuffer signed_event);
    CBuffer sync_events_for_system(CBuffer system, CBuffer network_requests);
    CBuffer query_explore_feed(CBuffer system, CBuffer network_requests, CBuffer feed_query, CBuffer cursor);
    CBuffer query_search_feed(CBuffer system, CBuffer network_requests, CBuffer feed_query, CBuffer search_query, CBuffer cursor);
    CBuffer query_author_feed(CBuffer system, CBuffer author, CBuffer network_requests, unsigned long limit, CBuffer latest_event_bytes);
    CBuffer query_references_feed(CBuffer system, CBuffer network_requests, CBuffer feed_query, CBuffer reference, CBuffer cursor);
    CBuffer query_crdt_for_system(CBuffer target_system, unsigned long content_type, CBuffer current_system, CBuffer network_requests);
    CBuffer query_comments_feed(CBuffer system, CBuffer network_requests, CBuffer feed_query, CBuffer cursor);
    CBuffer query_following_feed(CBuffer system, unsigned long limit, CBuffer latest_event_bytes);
    CBuffer query_likes_feed(CBuffer system, unsigned long limit, CBuffer latest_event_bytes);
    CBuffer query_opinion(CBuffer current_system, CBuffer target_pointer);
    CBuffer query_event_is_deleted(CBuffer pointer_bytes);
    CBuffer query_follows_for_system(CBuffer system_bytes);
    CBuffer query_blocks_for_system(CBuffer system_bytes);
    CBuffer query_servers_for_system(CBuffer system_bytes);
    CBuffer query_authorities_for_system(CBuffer system_bytes);
    CBuffer query_topics_for_system(CBuffer system_bytes);
    CBuffer query_feed_with_cursor(CBuffer feed_query_bytes);
    CBuffer query_events(CBuffer system_bytes, CBuffer process_bytes, unsigned long start_clock, unsigned long end_clock);
    CBuffer get_pointer(CBuffer event_bytes);
    CBuffer get_reference(CBuffer pointer_bytes);
    void free_bytes(CBuffer buf);
}

// RAII wrapper for CBuffer that integrates with JSI ArrayBuffer
class CBufferWrapper : public facebook::jsi::MutableBuffer {
public:
    CBufferWrapper(CBuffer buf) : buffer_(buf) {}

    ~CBufferWrapper() override {
        if (buffer_.bytes != nullptr) {
            free_bytes(buffer_);
        }
    }

    size_t size() const override {
        return static_cast<size_t>(buffer_.length);
    }

    uint8_t* data() override {
        return const_cast<uint8_t*>(buffer_.bytes);
    }

private:
    CBuffer buffer_;
};

namespace facebook::react {

class PolycentricCore : public NativeReactNativeCxxSpec<PolycentricCore> {
public:
    PolycentricCore(std::shared_ptr<CallInvoker> jsInvoker);

    jsi::Object initializeCore(jsi::Runtime& rt);
    jsi::Object isInitialized(jsi::Runtime& rt);
    jsi::Object createEvent(jsi::Runtime& rt, jsi::Object eventCreationData, double unixMs);
    jsi::Object ingestEvent(jsi::Runtime& rt, jsi::Object signedEvent);
    jsi::Object syncEventsForSystem(jsi::Runtime& rt, jsi::Object system, jsi::Object networkRequests);
    jsi::Object queryExploreFeed(jsi::Runtime& rt, jsi::Object system, jsi::Object networkRequests, jsi::Object feedQuery, jsi::Object cursor);
    jsi::Object querySearchFeed(jsi::Runtime& rt, jsi::Object system, jsi::Object networkRequests, jsi::Object feedQuery, jsi::Object searchQuery, jsi::Object cursor);
    jsi::Object queryAuthorFeed(jsi::Runtime& rt, jsi::Object system, jsi::Object author, jsi::Object networkRequests, double limit, jsi::Object latestEvent);
    jsi::Object queryReferencesFeed(jsi::Runtime& rt, jsi::Object system, jsi::Object networkRequests, jsi::Object feedQuery, jsi::Object reference, jsi::Object cursor);
    jsi::Object queryCrdtForSystem(jsi::Runtime& rt, jsi::Object targetSystem, double contentType, jsi::Object currentSystem, jsi::Object networkRequests);
    jsi::Object queryCommentsFeed(jsi::Runtime& rt, jsi::Object system, jsi::Object networkRequests, jsi::Object feedQuery, jsi::Object cursor);
    jsi::Object queryFollowingFeed(jsi::Runtime& rt, jsi::Object system, double limit, jsi::Object latestEvent);
    jsi::Object queryLikesFeed(jsi::Runtime& rt, jsi::Object system, double limit, jsi::Object latestEvent);
    jsi::Object queryOpinion(jsi::Runtime& rt, jsi::Object currentSystem, jsi::Object targetPointer);
    jsi::Object queryEventIsDeleted(jsi::Runtime& rt, jsi::Object pointer);
    jsi::Object queryFollowsForSystem(jsi::Runtime& rt, jsi::Object system);
    jsi::Object queryBlocksForSystem(jsi::Runtime& rt, jsi::Object system);
    jsi::Object queryServersForSystem(jsi::Runtime& rt, jsi::Object system);
    jsi::Object queryAuthoritiesForSystem(jsi::Runtime& rt, jsi::Object system);
    jsi::Object queryTopicsForSystem(jsi::Runtime& rt, jsi::Object system);
    jsi::Object queryFeedWithCursor(jsi::Runtime& rt, jsi::Object feedQuery);
    jsi::Object queryEvents(jsi::Runtime& rt, jsi::Object system, jsi::Object process, double startClock, double endClock);
    jsi::Object getPointer(jsi::Runtime& rt, jsi::Object eventBytes);
    jsi::Object getReference(jsi::Runtime& rt, jsi::Object pointerBytes);
};

}

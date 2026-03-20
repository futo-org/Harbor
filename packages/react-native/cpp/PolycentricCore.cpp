#include "PolycentricCore.h"

#include <climits>
#include <cmath>

namespace jsi = facebook::jsi;

namespace {

    // Rust FFI requires non-null pointers even for empty buffers.
    const uint8_t kDummyByte = 0;

    // Reads from a Uint8Array (TypedArray) passed from JS.
    // Validates shape and bounds to avoid OOB and invalid pointers
    CBuffer toCBuffer(jsi::Runtime& rt, const jsi::Object& object) {
        if (!object.hasProperty(rt, "buffer") ||
            !object.hasProperty(rt, "byteOffset") ||
            !object.hasProperty(rt, "byteLength")) {
            throw jsi::JSError(rt, "Expected Uint8Array");
        }

        auto bufferObj = object.getProperty(rt, "buffer").asObject(rt);
        auto arrayBuffer = bufferObj.getArrayBuffer(rt);

        double offsetNum = object.getProperty(rt, "byteOffset").asNumber();
        double lengthNum = object.getProperty(rt, "byteLength").asNumber();
        if (std::isnan(offsetNum) || std::isnan(lengthNum) || offsetNum < 0 || lengthNum < 0) {
            throw jsi::JSError(rt, "Invalid Uint8Array bounds (offset/length must be non-negative numbers)");
        }
        size_t offset = static_cast<size_t>(offsetNum);
        size_t length = static_cast<size_t>(lengthNum);

        size_t bufferSize = arrayBuffer.size(rt);
        if (offset > bufferSize || length > bufferSize - offset) {
            throw jsi::JSError(rt, "Invalid Uint8Array bounds (offset + length out of range)");
        }

        uint8_t* data = arrayBuffer.data(rt) + offset;
        int lengthInt = (length <= static_cast<size_t>(INT_MAX)) ? static_cast<int>(length) : INT_MAX;
        return {
            (length > 0 && data) ? data : &kDummyByte,
            lengthInt
        };
    }

    // Returns a Uint8Array so JS can pass it directly to protobufjs .decode()
    jsi::Object toUint8Array(jsi::Runtime& rt, CBuffer result) {
        auto wrapper = std::make_shared<CBufferWrapper>(result);
        auto arrayBuffer = jsi::ArrayBuffer(rt, wrapper);
        auto ctor = rt.global().getPropertyAsFunction(rt, "Uint8Array");
        return ctor.callAsConstructor(rt, std::move(arrayBuffer)).asObject(rt);
    }

}

namespace facebook::react {

PolycentricCore::PolycentricCore(std::shared_ptr<CallInvoker> jsInvoker)
    : NativeReactNativeCxxSpec(std::move(jsInvoker)) {}

jsi::Object PolycentricCore::initializeCore(jsi::Runtime& rt) {
    return toUint8Array(rt, ::initialize());
}

jsi::Object PolycentricCore::isInitialized(jsi::Runtime& rt) {
    return toUint8Array(rt, ::is_initialized());
}

jsi::Object PolycentricCore::createEvent(jsi::Runtime& rt, jsi::Object eventCreationData, double unixMs) {
    CBuffer input = toCBuffer(rt, eventCreationData);
    return toUint8Array(rt, ::create_event(input, static_cast<unsigned long>(unixMs)));
}

jsi::Object PolycentricCore::ingestEvent(jsi::Runtime& rt, jsi::Object signedEvent) {
    CBuffer input = toCBuffer(rt, signedEvent);
    return toUint8Array(rt, ::ingest_event(input));
}

jsi::Object PolycentricCore::syncEventsForSystem(jsi::Runtime& rt, jsi::Object system, jsi::Object networkRequests) {
    CBuffer sysInput = toCBuffer(rt, system);
    CBuffer netInput = toCBuffer(rt, networkRequests);
    return toUint8Array(rt, ::sync_events_for_system(sysInput, netInput));
}

jsi::Object PolycentricCore::queryExploreFeed(jsi::Runtime& rt, jsi::Object system, jsi::Object networkRequests, jsi::Object feedQuery, jsi::Object cursor) {
    CBuffer sysInput = toCBuffer(rt, system);
    CBuffer netInput = toCBuffer(rt, networkRequests);
    CBuffer queryInput = toCBuffer(rt, feedQuery);
    CBuffer cursorInput = toCBuffer(rt, cursor);
    return toUint8Array(rt, ::query_explore_feed(sysInput, netInput, queryInput, cursorInput));
}

jsi::Object PolycentricCore::querySearchFeed(jsi::Runtime& rt, jsi::Object system, jsi::Object networkRequests, jsi::Object feedQuery, jsi::Object searchQuery, jsi::Object cursor) {
    CBuffer sysInput = toCBuffer(rt, system);
    CBuffer netInput = toCBuffer(rt, networkRequests);
    CBuffer feedQueryInput = toCBuffer(rt, feedQuery);
    CBuffer searchQueryInput = toCBuffer(rt, searchQuery);
    CBuffer cursorInput = toCBuffer(rt, cursor);
    return toUint8Array(rt, ::query_search_feed(sysInput, netInput, feedQueryInput, searchQueryInput, cursorInput));
}

jsi::Object PolycentricCore::queryAuthorFeed(jsi::Runtime& rt, jsi::Object system, jsi::Object author, jsi::Object networkRequests, double limit, jsi::Object latestEvent) {
    CBuffer sysInput = toCBuffer(rt, system);
    CBuffer authorInput = toCBuffer(rt, author);
    CBuffer netInput = toCBuffer(rt, networkRequests);
    CBuffer latestEventInput = toCBuffer(rt, latestEvent);
    return toUint8Array(
        rt,
        ::query_author_feed(sysInput, authorInput, netInput, static_cast<unsigned long>(limit), latestEventInput)
    );
}

jsi::Object PolycentricCore::queryReferencesFeed(jsi::Runtime& rt, jsi::Object system, jsi::Object networkRequests, jsi::Object feedQuery, jsi::Object reference, jsi::Object cursor) {
    CBuffer sysInput = toCBuffer(rt, system);
    CBuffer netInput = toCBuffer(rt, networkRequests);
    CBuffer feedQueryInput = toCBuffer(rt, feedQuery);
    CBuffer refInput = toCBuffer(rt, reference);
    CBuffer cursorInput = toCBuffer(rt, cursor);
    return toUint8Array(rt, ::query_references_feed(sysInput, netInput, feedQueryInput, refInput, cursorInput));
}

jsi::Object PolycentricCore::queryCrdtForSystem(jsi::Runtime& rt, jsi::Object targetSystem, double contentType, jsi::Object currentSystem, jsi::Object networkRequests) {
    CBuffer targetInput = toCBuffer(rt, targetSystem);
    CBuffer currentInput = toCBuffer(rt, currentSystem);
    CBuffer netInput = toCBuffer(rt, networkRequests);
    return toUint8Array(rt, ::query_crdt_for_system(targetInput, static_cast<unsigned long>(contentType), currentInput, netInput));
}

jsi::Object PolycentricCore::queryCommentsFeed(jsi::Runtime& rt, jsi::Object system, jsi::Object networkRequests, jsi::Object feedQuery, jsi::Object cursor) {
    CBuffer sysInput = toCBuffer(rt, system);
    CBuffer netInput = toCBuffer(rt, networkRequests);
    CBuffer feedQueryInput = toCBuffer(rt, feedQuery);
    CBuffer cursorInput = toCBuffer(rt, cursor);
    return toUint8Array(rt, ::query_comments_feed(sysInput, netInput, feedQueryInput, cursorInput));
}

jsi::Object PolycentricCore::queryFollowingFeed(jsi::Runtime& rt, jsi::Object system, double limit, jsi::Object latestEvent) {
    CBuffer sysInput = toCBuffer(rt, system);
    CBuffer latestEventInput = toCBuffer(rt, latestEvent);
    return toUint8Array(rt, ::query_following_feed(sysInput, static_cast<unsigned long>(limit), latestEventInput));
}

jsi::Object PolycentricCore::queryLikesFeed(jsi::Runtime& rt, jsi::Object system, double limit, jsi::Object latestEvent) {
    CBuffer sysInput = toCBuffer(rt, system);
    CBuffer latestEventInput = toCBuffer(rt, latestEvent);
    return toUint8Array(rt, ::query_likes_feed(sysInput, static_cast<unsigned long>(limit), latestEventInput));
}

jsi::Object PolycentricCore::queryOpinion(jsi::Runtime& rt, jsi::Object currentSystem, jsi::Object targetPointer) {
    CBuffer currentInput = toCBuffer(rt, currentSystem);
    CBuffer pointerInput = toCBuffer(rt, targetPointer);
    return toUint8Array(rt, ::query_opinion(currentInput, pointerInput));
}

jsi::Object PolycentricCore::queryEventIsDeleted(jsi::Runtime& rt, jsi::Object pointer) {
    CBuffer input = toCBuffer(rt, pointer);
    return toUint8Array(rt, ::query_event_is_deleted(input));
}

jsi::Object PolycentricCore::queryFollowsForSystem(jsi::Runtime& rt, jsi::Object system) {
    CBuffer input = toCBuffer(rt, system);
    return toUint8Array(rt, ::query_follows_for_system(input));
}

jsi::Object PolycentricCore::queryBlocksForSystem(jsi::Runtime& rt, jsi::Object system) {
    CBuffer input = toCBuffer(rt, system);
    return toUint8Array(rt, ::query_blocks_for_system(input));
}

jsi::Object PolycentricCore::queryServersForSystem(jsi::Runtime& rt, jsi::Object system) {
    CBuffer input = toCBuffer(rt, system);
    return toUint8Array(rt, ::query_servers_for_system(input));
}

jsi::Object PolycentricCore::queryAuthoritiesForSystem(jsi::Runtime& rt, jsi::Object system) {
    CBuffer input = toCBuffer(rt, system);
    return toUint8Array(rt, ::query_authorities_for_system(input));
}

jsi::Object PolycentricCore::queryTopicsForSystem(jsi::Runtime& rt, jsi::Object system) {
    CBuffer input = toCBuffer(rt, system);
    return toUint8Array(rt, ::query_topics_for_system(input));
}

jsi::Object PolycentricCore::queryFeedWithCursor(jsi::Runtime& rt, jsi::Object feedQuery) {
    CBuffer input = toCBuffer(rt, feedQuery);
    return toUint8Array(rt, ::query_feed_with_cursor(input));
}

jsi::Object PolycentricCore::queryEvents(jsi::Runtime& rt, jsi::Object system, jsi::Object process, double startClock, double endClock) {
    CBuffer sysInput = toCBuffer(rt, system);
    CBuffer procInput = toCBuffer(rt, process);
    return toUint8Array(rt, ::query_events(sysInput, procInput, static_cast<unsigned long>(startClock), static_cast<unsigned long>(endClock)));
}

jsi::Object PolycentricCore::getPointer(jsi::Runtime& rt, jsi::Object eventBytes) {
    CBuffer input = toCBuffer(rt, eventBytes);
    return toUint8Array(rt, ::get_pointer(input));
}

jsi::Object PolycentricCore::getReference(jsi::Runtime& rt, jsi::Object pointerBytes) {
    CBuffer input = toCBuffer(rt, pointerBytes);
    return toUint8Array(rt, ::get_reference(input));
}

}

#include "PolycentricCore.h"

#include <climits>
#include <cmath>
#include <cstdint>
#include <string>

namespace jsi = facebook::jsi;

namespace {

    // Rust FFI requires non-null pointers even for empty buffers.
    const uint8_t kDummyByte = 0;

    // Reads from a Uint8Array (TypedArray) passed from JS.
    // Validates shape and bounds to avoid OOB and invalid pointers
    CResult toCResult(jsi::Runtime& rt, const jsi::Object& object) {
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
        uint32_t lengthUint = (length <= UINT32_MAX) ? static_cast<uint32_t>(length) : UINT32_MAX;
        return {
            true,
            (length > 0 && data) ? data : &kDummyByte,
            lengthUint
        };
    }

    jsi::Object toUint8Array(jsi::Runtime& rt, CResult result) {
        auto wrapper = std::make_shared<CResultWrapper>(result);
        auto arrayBuffer = jsi::ArrayBuffer(rt, wrapper);
        auto ctor = rt.global().getPropertyAsFunction(rt, "Uint8Array");
        return ctor.callAsConstructor(rt, std::move(arrayBuffer)).asObject(rt);
    }

    // Checks CResult and converts to Uint8Array or throws JSError.
    // On error (success=false), frees the buffer and throws jsi::JSError.
    // On success, wraps as a Uint8Array.
    jsi::Object resultToUint8Array(jsi::Runtime& rt, CResult result) {
        if (!result.success) {
            std::string msg(reinterpret_cast<const char*>(result.bytes), result.length);
            free_result(result);
            throw jsi::JSError(rt, msg);
        }
        return toUint8Array(rt, result);
    }

}

namespace facebook::react {

PolycentricCore::PolycentricCore(std::shared_ptr<CallInvoker> jsInvoker)
    : NativeReactNativeCxxSpec(std::move(jsInvoker)) {}


jsi::Object PolycentricCore::verifySignedEvent(jsi::Runtime& rt, jsi::Object signedEventBytes) {
    CResult input = toCResult(rt, signedEventBytes);
    return resultToUint8Array(rt, ::verify_signed_event(input));
}

jsi::Object PolycentricCore::decodeEventFromSignedEvent(jsi::Runtime& rt, jsi::Object signedEventBytes) {
    CResult input = toCResult(rt, signedEventBytes);
    return resultToUint8Array(rt, ::decode_event_from_signed_event(input));
}

jsi::Object PolycentricCore::validateEvent(jsi::Runtime& rt, jsi::Object eventBytes) {
    CResult input = toCResult(rt, eventBytes);
    return resultToUint8Array(rt, ::validate_event(input));
}

jsi::Object PolycentricCore::nextSequence(
    jsi::Runtime& rt,
    jsi::Object identity,
    double collection,
    jsi::Object signedBy) {
    CResult identityBuf = toCResult(rt, identity);
    CResult signedByBuf = toCResult(rt, signedBy);
    int32_t collectionInt = static_cast<int32_t>(collection);
    return resultToUint8Array(rt, ::next_sequence(identityBuf, collectionInt, signedByBuf));
}

jsi::Object PolycentricCore::buildVectorClock(
    jsi::Runtime& rt,
    jsi::Object identity,
    double collection,
    double identitySequence,
    jsi::Object signedBy,
    double currentSequence) {
    CResult identityBuf = toCResult(rt, identity);
    CResult signedByBuf = toCResult(rt, signedBy);
    int32_t collectionInt = static_cast<int32_t>(collection);
    uint64_t idSeq = static_cast<uint64_t>(identitySequence);
    uint64_t curSeq = static_cast<uint64_t>(currentSequence);
    return resultToUint8Array(
        rt,
        ::build_vector_clock(identityBuf, collectionInt, idSeq, signedByBuf, curSeq));
}

jsi::Object PolycentricCore::copyEvent(jsi::Runtime& rt, jsi::Object signedEventBytes) {
    CResult input = toCResult(rt, signedEventBytes);
    return resultToUint8Array(rt, ::copy_event(input));
}

jsi::Object PolycentricCore::copyContent(
    jsi::Runtime& rt,
    jsi::Object digestBytes,
    jsi::Object contentBytes) {
    CResult digestBuf = toCResult(rt, digestBytes);
    CResult contentBuf = toCResult(rt, contentBytes);
    return resultToUint8Array(rt, ::copy_content(digestBuf, contentBuf));
}

}

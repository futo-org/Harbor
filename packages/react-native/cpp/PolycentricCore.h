#pragma once

#include <PolycentricSpecJSI.h>
#include <jsi/jsi.h>
#include <cstdint>
#include <memory>
#include <string>

extern "C" {
    struct CResult {
        bool success;
        const uint8_t* bytes;
        uint32_t length;
    };

    CResult verify_signed_event(CResult signed_event_bytes);
    CResult decode_event_from_signed_event(CResult signed_event_bytes);
    CResult validate_event(CResult event_bytes);
    CResult next_sequence(CResult identity, int32_t collection, CResult signed_by);
    CResult build_vector_clock(
        CResult identity,
        int32_t collection,
        uint64_t identity_sequence,
        CResult signed_by,
        uint64_t current_sequence);
    CResult copy_event(CResult signed_event_bytes);
    CResult copy_content(CResult digest_bytes, CResult content_bytes);

    void free_result(CResult result);
}

// RAII wrapper for CResult that integrates with JSI ArrayBuffer.
class CResultWrapper : public facebook::jsi::MutableBuffer {
public:
    CResultWrapper(CResult result) : result_(result) {}

    ~CResultWrapper() override {
        if (result_.bytes != nullptr) {
            free_result(result_);
        }
    }

    size_t size() const override {
        return static_cast<size_t>(result_.length);
    }

    uint8_t* data() override {
        return const_cast<uint8_t*>(result_.bytes);
    }

private:
    CResult result_;
};

namespace facebook::react {

class PolycentricCore : public NativeReactNativeCxxSpec<PolycentricCore> {
public:
    PolycentricCore(std::shared_ptr<CallInvoker> jsInvoker);

    jsi::Object verifySignedEvent(jsi::Runtime& rt, jsi::Object signedEventBytes);
    jsi::Object decodeEventFromSignedEvent(jsi::Runtime& rt, jsi::Object signedEventBytes);
    jsi::Object validateEvent(jsi::Runtime& rt, jsi::Object eventBytes);
    jsi::Object nextSequence(
        jsi::Runtime& rt,
        jsi::Object identity,
        double collection,
        jsi::Object signedBy);
    jsi::Object buildVectorClock(
        jsi::Runtime& rt,
        jsi::Object identity,
        double collection,
        double identitySequence,
        jsi::Object signedBy,
        double currentSequence);
    jsi::Object copyEvent(jsi::Runtime& rt, jsi::Object signedEventBytes);
    jsi::Object copyContent(jsi::Runtime& rt, jsi::Object digestBytes, jsi::Object contentBytes);
};

}

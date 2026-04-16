/**
 * FFI bridge implementing the v2 IPolycentricCore interface.
 *
 * Crypto operations (verify, validate, sign) route through the native
 * TurboModule → C++ → Rust FFI static library.
 *
 * Network operations (list_events, put_events) use gRPC-web over fetch
 * because the Rust FFI cannot perform async HTTP from a static lib.
 */
import type {
  ICoreBridge,
  IPolycentricCore,
  SignEventCallback,
} from '@polycentric/js-core';
import { v2 } from '@polycentric/js-core';
import PolycentricCore from '../NativeReactNative';
import { polycentric_ffi } from '../generated/protocol';

const { ListEventsRequest } = v2;

// ── Native module helpers ────────────────────────────────────────────

function decodeResult(result: Object): polycentric_ffi.Result {
  return polycentric_ffi.Result.decode(result as Uint8Array);
}

function unwrapResult(result: polycentric_ffi.Result): Uint8Array {
  if (result.result !== 'value') {
    throw new Error(result.error ?? `Unexpected result: ${result.result}`);
  }
  return result.value ?? new Uint8Array(0);
}

export function initialize(): void {
  unwrapResult(decodeResult(PolycentricCore.initializeCore()));
}

export function isInitialized(): boolean {
  const bytes = unwrapResult(decodeResult(PolycentricCore.isInitialized()));
  return bytes.length > 0 && bytes[0] === 1;
}

/**
 * Call a v2 native function that returns raw bytes (not wrapped in
 * polycentric_ffi.Result). Negative CBuffer length means error string.
 * The C++ layer encodes errors as CBuffer with negative length, which
 * comes through as a Uint8Array. We detect errors by checking the
 * native return.
 */
function callNativeV2(
  nativeFn: (input: Object) => Object,
  input: Uint8Array
): Uint8Array {
  const result = nativeFn(input) as Uint8Array;
  return result;
}

// ── gRPC-web helpers ─────────────────────────────────────────────────

function grpcWebEncode(body: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + body.length);
  frame[0] = 0;
  new DataView(frame.buffer).setUint32(1, body.length, false);
  frame.set(body, 5);
  return frame;
}

function grpcWebDecodeFirst(buf: Uint8Array): Uint8Array {
  const dataLen = new DataView(buf.buffer, buf.byteOffset).getUint32(1, false);
  return buf.slice(5, 5 + dataLen);
}

// ── v2 IPolycentricCore implementation ───────────────────────────────

class NativePolycentricCore implements IPolycentricCore {
  /** Verify ed25519 signature via Rust FFI and return SignedEvent bytes. */
  verify_signed_event(signedEventBytes: Uint8Array): Uint8Array {
    return callNativeV2(
      PolycentricCore.verifySignedEventV2.bind(PolycentricCore),
      signedEventBytes
    );
  }

  /** Decode the inner Event bytes from a SignedEvent via Rust FFI. */
  decode_event_from_signed_event(signedEventBytes: Uint8Array): Uint8Array {
    return callNativeV2(
      PolycentricCore.decodeEventFromSignedEventV2.bind(PolycentricCore),
      signedEventBytes
    );
  }

  /**
   * Sign an event via the JS callback (crypto manager).
   * Validates the event bytes via Rust FFI before delegating signing.
   */
  async sign_event(
    eventBytes: Uint8Array,
    signEvent: SignEventCallback
  ): Promise<Uint8Array> {
    // Validate via native Rust FFI
    callNativeV2(
      PolycentricCore.validateEventV2.bind(PolycentricCore),
      eventBytes
    );

    return signEvent(eventBytes);
  }

  /**
   * Commit a signed event. Native-side persistence will eventually flow
   * through the Rust FFI EventStore; for now it's a no-op on this bridge
   * because PolycentricClient.commitEvent handles storage directly.
   */
  async commit_event(_signedEventBytes: Uint8Array): Promise<void> {
    // no-op
  }

  /** Copy signed events into the core — not wired through native FFI yet. */
  copy_events(_signedEvents: Uint8Array[]): void {
    // no-op
  }

  /** Copy content into the core — not wired through native FFI yet. */
  copy_contents(_contentMap: Map<Uint8Array, Uint8Array>): void {
    // no-op
  }

  /**
   * Next sequence — not wired through native FFI yet.
   * TODO: route through a native call once the FFI EventStore is ready.
   */
  next_sequence(
    _identity: string,
    _collection: number,
    _signedBy: Uint8Array
  ): bigint {
    return 1n;
  }

  /**
   * Build vector clock — not wired through native FFI yet.
   * TODO: route through a native call once the FFI stores are ready.
   */
  build_vector_clock(
    _identity: string,
    _collection: number,
    _identitySequence: bigint,
    _signedBy: Uint8Array,
    _currentSequence: bigint
  ): Uint8Array {
    return new Uint8Array(0);
  }

  /** Fetch events from a server via gRPC-web (network — cannot go through FFI). */
  async list_events(
    serverUrl: string,
    size?: number | null,
    identity?: string | null,
    collection?: number | null,
    signedBy?: Uint8Array | null,
    signedByKeyType?: number | null,
    sequenceGt?: number | null,
    sequenceLt?: number | null
  ): Promise<Uint8Array> {
    const request = ListEventsRequest.toBinary(
      ListEventsRequest.create({
        size: size ?? undefined,
        filters: {
          collection: collection ?? undefined,
          identity: identity ?? undefined,
          signedBy:
            signedBy != null
              ? { keyType: signedByKeyType ?? 1, key: signedBy }
              : undefined,
          sequenceGt: sequenceGt != null ? BigInt(sequenceGt) : undefined,
          sequenceLt: sequenceLt != null ? BigInt(sequenceLt) : undefined,
        },
      })
    );

    const res = await fetch(
      `${serverUrl}/polycentric.v2.EventSyncService/ListEvents`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/grpc-web+proto',
          'accept': 'application/grpc-web+proto',
        },
        body: grpcWebEncode(request).buffer as ArrayBuffer,
      }
    );

    if (!res.ok) throw new Error(`gRPC-web ListEvents error: ${res.status}`);

    const buf = new Uint8Array(await res.arrayBuffer());
    return grpcWebDecodeFirst(buf);
  }

  /** Push events to a server via gRPC-web (network — cannot go through FFI). */
  async put_events(
    serverUrl: string,
    eventBundlesBytes: Uint8Array
  ): Promise<void> {
    const res = await fetch(
      `${serverUrl}/polycentric.v2.EventSyncService/PutEvents`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/grpc-web+proto',
          'accept': 'application/grpc-web+proto',
        },
        body: grpcWebEncode(eventBundlesBytes).buffer as ArrayBuffer,
      }
    );

    if (!res.ok) throw new Error(`gRPC-web PutEvents error: ${res.status}`);
  }
}

// ── Core bridge ──────────────────────────────────────────────────────

export class NativeCoreBridge implements ICoreBridge {
  private core?: NativePolycentricCore;

  async initialize(): Promise<IPolycentricCore> {
    if (!this.core) {
      if (!isInitialized()) {
        initialize();
      }
      this.core = new NativePolycentricCore();
    }
    return this.core;
  }

  getCoreInstance(): IPolycentricCore {
    if (!this.core) {
      throw new Error('Native core is not initialized');
    }
    return this.core;
  }

  initialized(): boolean {
    return this.core !== undefined && isInitialized();
  }

  supportedOnPlatform(): boolean {
    return true;
  }
}

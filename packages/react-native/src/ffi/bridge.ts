/**
 * FFI bridge implementing the IPolycentricCore interface.
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

const { ListEventsRequest, GetFeedRequest, SignedEvent } = v2;

// ── Native module helpers ────────────────────────────────────────────

// Call a native function. C++ layer throws JSError on failure via CResult.
function callNative(
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
    return callNative(
      PolycentricCore.verifySignedEvent.bind(PolycentricCore),
      signedEventBytes
    );
  }

  /** Decode the inner Event bytes from a SignedEvent via Rust FFI. */
  decode_event_from_signed_event(signedEventBytes: Uint8Array): Uint8Array {
    return callNative(
      PolycentricCore.decodeEventFromSignedEvent.bind(PolycentricCore),
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
    callNative(PolycentricCore.validateEvent.bind(PolycentricCore), eventBytes);

    const signature = await signEvent(eventBytes);

    const signedEventBytes = SignedEvent.toBinary(
      SignedEvent.create({ signature, eventBytes })
    );

    callNative(
      PolycentricCore.verifySignedEvent.bind(PolycentricCore),
      signedEventBytes
    );

    return signedEventBytes;
  }

  /**
   * Commit a signed event. Native-side persistence will eventually flow
   * through the Rust FFI EventStore; for now it's a no-op on this bridge
   * because PolycentricClient.commitEvent handles storage directly.
   */
  async commit_event(_signedEventBytes: Uint8Array): Promise<void> {
    // no-op
  }

  copy_events(signedEvents: Uint8Array[]): void {
    for (const bytes of signedEvents) {
      PolycentricCore.copyEvent(bytes);
    }
  }

  copy_contents(contentMap: Map<Uint8Array, Uint8Array>): void {
    for (const [digest, content] of contentMap) {
      PolycentricCore.copyContent(digest, content);
    }
  }

  next_sequence(
    identity: string,
    collection: number,
    signedBy: Uint8Array
  ): bigint {
    const identityBytes = new TextEncoder().encode(identity);
    const result = PolycentricCore.nextSequence(
      identityBytes,
      collection,
      signedBy
    ) as Uint8Array;
    return new DataView(
      result.buffer,
      result.byteOffset,
      result.byteLength
    ).getBigUint64(0, true);
  }

  build_vector_clock(
    identity: string,
    collection: number,
    identitySequence: bigint,
    signedBy: Uint8Array,
    currentSequence: bigint
  ): Uint8Array {
    const identityBytes = new TextEncoder().encode(identity);
    return PolycentricCore.buildVectorClock(
      identityBytes,
      collection,
      Number(identitySequence),
      signedBy,
      Number(currentSequence)
    ) as Uint8Array;
  }

  /** Fetch events from a server via gRPC-web (network — cannot go through FFI). */
  async list_events(
    serverUrl: string,
    size?: number | null,
    identity?: string | null,
    collection?: number | null,
    signedBy?: Uint8Array | null,
    signedByKeyType?: number | null,
    sequenceGt?: bigint | null,
    sequenceLt?: bigint | null
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
          sequenceGt: sequenceGt ?? undefined,
          sequenceLt: sequenceLt ?? undefined,
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

  /**
   * List non-deleted event bundles — not wired through native FFI yet.
   * TODO: route through a native call once the FFI stores are ready.
   */
  list_valid_events(_identity: string, _collection: number): Uint8Array {
    return v2.ListEventsResponse.toBinary(
      v2.ListEventsResponse.create({
        eventBundles: [],
        previousToken: '',
        nextToken: '',
      })
    );
  }

  /** Fetch a curated feed from a server via gRPC-web. */
  async get_feed(
    serverUrl: string,
    algorithm: number,
    limit?: number | null,
    identity?: string | null
  ): Promise<Uint8Array> {
    const request = GetFeedRequest.toBinary(
      GetFeedRequest.create({
        algorithm,
        limit: limit ?? undefined,
        identity: identity ?? undefined,
      })
    );

    const res = await fetch(
      `${serverUrl}/polycentric.v2.FeedsService/GetFeed`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/grpc-web+proto',
          'accept': 'application/grpc-web+proto',
        },
        body: grpcWebEncode(request).buffer as ArrayBuffer,
      }
    );

    if (!res.ok) throw new Error(`gRPC-web GetFeed error: ${res.status}`);

    const buf = new Uint8Array(await res.arrayBuffer());
    return grpcWebDecodeFirst(buf);
  }

  /** Fetch a parent post and its direct replies from a server via gRPC-web. */
  async get_post_thread(
    serverUrl: string,
    requestBytes: Uint8Array
  ): Promise<Uint8Array> {
    const res = await fetch(
      `${serverUrl}/polycentric.v2.FeedsService/GetPostThread`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/grpc-web+proto',
          'accept': 'application/grpc-web+proto',
        },
        body: grpcWebEncode(requestBytes).buffer as ArrayBuffer,
      }
    );

    if (!res.ok) throw new Error(`gRPC-web GetPostThread error: ${res.status}`);

    const buf = new Uint8Array(await res.arrayBuffer());
    return grpcWebDecodeFirst(buf);
  }

  /** Image processing is not wired through native FFI yet. */
  process_image_to_jpeg(
    _image: Uint8Array,
    _width: number,
    _height: number,
    _mode: 'fill' | 'fit'
  ): Uint8Array {
    throw new Error('process_image_to_jpeg is not implemented on native yet');
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

  /** Upload a blob body to a server via gRPC-web. */
  async upload_blob(
    serverUrl: string,
    requestBytes: Uint8Array
  ): Promise<void> {
    const res = await fetch(
      `${serverUrl}/polycentric.v2.ContentService/UploadBlob`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/grpc-web+proto',
          'accept': 'application/grpc-web+proto',
        },
        body: grpcWebEncode(requestBytes).buffer as ArrayBuffer,
      }
    );

    if (!res.ok) throw new Error(`gRPC-web UploadBlob error: ${res.status}`);
  }

  /** Fetch a server's public info via gRPC-web. */
  async get_server_info(serverUrl: string): Promise<Uint8Array> {
    // GetServerInfoRequest has no fields, so the body is an empty proto.
    const request = new Uint8Array(0);

    const res = await fetch(
      `${serverUrl}/polycentric.v2.ServerService/GetInfo`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/grpc-web+proto',
          'accept': 'application/grpc-web+proto',
        },
        body: grpcWebEncode(request).buffer as ArrayBuffer,
      }
    );

    if (!res.ok) throw new Error(`gRPC-web GetInfo error: ${res.status}`);

    const buf = new Uint8Array(await res.arrayBuffer());
    return grpcWebDecodeFirst(buf);
  }
}

// ── Core bridge ──────────────────────────────────────────────────────

export class NativeCoreBridge implements ICoreBridge {
  private core?: NativePolycentricCore;

  async initialize(): Promise<IPolycentricCore> {
    if (!this.core) {
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
    return this.core !== undefined;
  }

  supportedOnPlatform(): boolean {
    return true;
  }
}

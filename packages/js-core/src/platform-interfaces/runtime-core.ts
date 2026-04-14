export type SignEventCallback = (eventBytes: Uint8Array) => Promise<Uint8Array>;
export type PersistEventCallback = (
  signedEventBytes: Uint8Array,
) => Promise<void>;

export interface IPolycentricCore {
  /**
   * Build vector clocks from head events (one per signer+collection).
   *
   * Thin WASM wrapper around `crate::event::vector_clock::build_vector_clocks`.
   */
  build_vector_clock(
    signed_by: Uint8Array,
    head_events: Uint8Array[],
  ): Uint8Array[];
  /**
   * Commit event bytes via a JS callback
   *
   * # Arguments
   * * `event_bytes` - Serialized Event protobuf bytes to sign
   * * `sign_event` - JS callback: (Uint8Array) => Promise<Uint8Array> that returns SignedEvent bytes
   * * `persist_event` - JS callback: (Uint8Array) => Promise<void> to persist the signed event
   *
   * # Returns
   * * `Result<Uint8Array, JsValue>` - The signed event bytes
   */
  commit_event(signed_event_bytes: Uint8Array): Promise<void>;
  /**
   * Decode an event from a signed event's event_bytes field.
   *
   * # Arguments
   * * `signed_event` - Serialized SignedEvent protobuf bytes
   */
  decode_event_from_signed_event(signed_event: Uint8Array): Uint8Array;
  /**
   * Fetch events from a server via gRPC-web.
   *
   * # Arguments
   * * `server_url` - The base URL of the gRPC-web server (e.g. "http://localhost:50051")
   * * `limit` - Maximum number of events to fetch
   * * `identity` - Optional serialized Identity message bytes to filter by
   * * `stream_id` - Optional stream ID to filter by
   * * `signed_by` - Optional public key bytes to filter by
   * * `signed_by_key_type` - Key type for signed_by (required if signed_by is set)
   *
   * # Returns
   * * Serialized ListEventsResponse protobuf bytes
   */
  list_events(
    server_url: string,
    limit?: number | null,
    identity?: string | null,
    collection?: number | null,
    signed_by?: Uint8Array | null,
    signed_by_key_type?: number | null,
  ): Promise<Uint8Array>;

  /**
   * Push event bundles to a server via gRPC-web.
   *
   * # Arguments
   * * `server_url` - The base URL of the gRPC-web server
   * * `event_bundles_bytes` - Serialized PutEventsRequest protobuf bytes
   */
  put_events(
    server_url: string,
    event_bundles_bytes: Uint8Array,
  ): Promise<void>;
  /**
   * Sign event bytes via a JS callback
   *
   * # Arguments
   * * `event_bytes` - Serialized Event protobuf bytes to sign
   * * `sign_event` - JS callback: (Uint8Array) => Promise<Uint8Array> that returns SignedEvent bytes
   *
   * # Returns
   * * `Result<Uint8Array, JsValue>` - The signed event bytes
   */
  sign_event(
    event_bytes: Uint8Array,
    callback: (eventBytes: Uint8Array) => Promise<Uint8Array>,
  ): Promise<Uint8Array>;
  /**
   * Decode and verify a signed event from bytes.
   *
   * # Arguments
   * * `signed_event` - Serialized SignedEvent protobuf bytes
   *
   * # Returns
   * * `Result<Uint8Array, JsValue>` - The verified SignedEvent bytes or error
   */
  verify_signed_event(signed_event: Uint8Array): Uint8Array;
}

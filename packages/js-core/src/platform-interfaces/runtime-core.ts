export type SignEventCallback = (eventBytes: Uint8Array) => Promise<Uint8Array>;
export type PersistEventCallback = (
  signedEventBytes: Uint8Array,
) => Promise<void>;

export interface IPolycentricCore {
  verify_signed_event(signedEvent: Uint8Array): Uint8Array;
  decode_event_from_signed_event(signedEvent: Uint8Array): Uint8Array;
  sign_and_persist_event(
    eventBytes: Uint8Array,
    signEvent: SignEventCallback,
    persistEvent: PersistEventCallback,
  ): Promise<Uint8Array>;
  list_events(
    serverUrl: string,
    limit?: number | null,
    identity?: Uint8Array | null,
    streamId?: string | null,
    signedBy?: Uint8Array | null,
    signedByKeyType?: number | null,
  ): Promise<Uint8Array>;
  put_events(
    serverUrl: string,
    eventBundlesBytes: Uint8Array,
  ): Promise<void>;
}

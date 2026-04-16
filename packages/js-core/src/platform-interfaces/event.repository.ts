import type * as Proto from '../proto/v2';

/**
 * EventRepository stores and retrieves signed events.
 */
export interface IEventRepository {
  /**
   * Save one or multiple events to the repository
   */
  save(signedEvents: Proto.SignedEvent | Proto.SignedEvent[]): Promise<void>;

  getAll(): Promise<Proto.SignedEvent[]>;
  getBatch(
    batchSize: number,
    offset?: number,
  ): Promise<{
    events: Proto.SignedEvent[];
    offset: number;
  }>;

  /**
   * Point lookup by EventKey. Returns null if not present locally.
   *
   * @param key - The full EventKey (collection, identity, signedBy, sequence)
   */
  getByEventKey(key: Proto.EventKey): Promise<Proto.SignedEvent | null>;

  /**
   * Query events for an identity.
   *
   * Optional `signer` and `collection` filters narrow the scan. When
   * `headsOnly` is true, returns one event per (signer, collection) — the
   * highest-sequence entry for each stream. Otherwise returns all matching
   * events sorted by sequence ascending.
   *
   * @param identity - The identity key (hex hash)
   * @param options - Optional filters and head-only flag
   */
  getByIdentity(
    identity: string,
    options?: {
      signer?: Proto.PublicKey;
      collection?: number;
      headsOnly?: boolean;
    },
  ): Promise<Proto.SignedEvent[]>;
}

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
   * Get the next sequence number for a given public key, collection, and identity.
   * Returns max(sequence) + 1 across all stored events matching, or 1n if none exist.
   *
   * @param publicKey - The public key bytes of the signer
   * @param collection - The collection ID
   * @param identity - The identity key (hex hash)
   */
  getNextSequence(
    publicKey: Proto.PublicKey,
    collection: number,
    identity: string,
  ): Promise<bigint>;

  /**
   * Get the event with the highest sequence number for a given public key and identity.
   * Returns null if no events exist for the key+identity.
   *
   * @param publicKey - The public key bytes of the signer
   * @param identity - The identity key (hex hash)
   */
  getLatestEvent(
    publicKey: Proto.PublicKey,
    identity: string,
  ): Promise<Proto.SignedEvent | null>;

  /**
   * Get all events for a given public key and identity, ordered by sequence ascending.
   *
   * @param publicKey - The public key bytes of the signer
   * @param identity - The identity key (hex hash)
   */
  getEventsByIdentity(
    publicKey: Proto.PublicKey,
    identity: string,
  ): Promise<Proto.SignedEvent[]>;
}

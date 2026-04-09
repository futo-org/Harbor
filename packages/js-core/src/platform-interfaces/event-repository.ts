import type { SignedEvent } from '../proto/polycentric/v2/events';

/**
 * EventRepository stores and retrieves signed events.
 */
export interface IEventRepository {
  persistEvent(signedEvent: SignedEvent): Promise<void>;
  persistEvents(signedEvents: SignedEvent[]): Promise<void>;
  getAllEvents(): Promise<SignedEvent[]>;
  getEventsBatch(
    batchSize: number,
    offset?: number,
  ): Promise<{
    events: SignedEvent[];
    offset: number;
  }>;

  /**
   * Get the next sequence number for a given public key and identity.
   * Returns max(sequence) + 1 across all stored events matching the key and identity,
   * or 1n if no events exist.
   *
   * @param publicKey - The public key bytes of the signer
   * @param identity - The identity key (hex hash)
   */
  getNextSequence(publicKey: Uint8Array, identity: string): Promise<bigint>;

  /**
   * Get the event with the highest sequence number for a given public key and identity.
   * Returns null if no events exist for the key+identity.
   *
   * @param publicKey - The public key bytes of the signer
   * @param identity - The identity key (hex hash)
   */
  getLatestEvent(publicKey: Uint8Array, identity: string): Promise<SignedEvent | null>;

  /**
   * Get all events for a given public key and identity, ordered by sequence ascending.
   *
   * @param publicKey - The public key bytes of the signer
   * @param identity - The identity key (hex hash)
   */
  getEventsByIdentity(publicKey: Uint8Array, identity: string): Promise<SignedEvent[]>;
}

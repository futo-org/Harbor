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
   * Get the next sequence number for a given public key and stream.
   * Returns max(sequence) + 1 across all stored events matching the key and stream,
   * or 1n if no events exist.
   *
   * @param publicKey - The public key bytes of the signer
   * @param streamId - The stream identifier
   */
  getNextSequence(publicKey: Uint8Array, streamId: string): Promise<bigint>;
}

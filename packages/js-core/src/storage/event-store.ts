import { IEventRepository } from '../platform-interfaces';
import { SignedEvent } from '../proto/polycentric/v2/events';
import { DatabaseError } from '../errors';

/**
 * EventStore provides operations for persisting events.
 *
 * EventStore wraps an IEventRepository and provides business logic validation.
 * EventStore does not provide operations for querying events.
 * To query events, use QueryManager.
 */
export class EventStore {
  constructor(private repository: IEventRepository) {}

  async persistEvent(signedEvent: SignedEvent): Promise<void> {
    if (!signedEvent.signature || signedEvent.signature.length === 0) {
      throw new DatabaseError('SignedEvent must have a valid signature');
    }

    if (!signedEvent.eventBytes || signedEvent.eventBytes.length === 0) {
      throw new DatabaseError('SignedEvent must have valid event data');
    }

    await this.repository.persistEvent(signedEvent);
  }

  async persistEvents(signedEvents: SignedEvent[]): Promise<void> {
    for (const signedEvent of signedEvents) {
      if (!signedEvent) {
        throw new DatabaseError('SignedEvent cannot be null or undefined');
      }
    }

    await this.repository.persistEvents(signedEvents);
  }

  async getAllEvents(): Promise<SignedEvent[]> {
    return this.repository.getAllEvents();
  }

  async getEventsBatch(
    batchSize: number,
    offset?: number,
  ): Promise<{
    events: SignedEvent[];
    offset: number;
  }> {
    return this.repository.getEventsBatch(batchSize, offset);
  }

  async getNextSequence(publicKey: Uint8Array, identity: string): Promise<bigint> {
    return this.repository.getNextSequence(publicKey, identity);
  }

  async getLatestEvent(publicKey: Uint8Array, identity: string): Promise<SignedEvent | null> {
    return this.repository.getLatestEvent(publicKey, identity);
  }

  async getEventsByIdentity(publicKey: Uint8Array, identity: string): Promise<SignedEvent[]> {
    return this.repository.getEventsByIdentity(publicKey, identity);
  }
}

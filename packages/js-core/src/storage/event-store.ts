import { IEventRepository } from '../platform-interfaces';
import * as Proto from '../proto/v2';
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

  async save(
    signedEvents: Proto.SignedEvent | Proto.SignedEvent[],
  ): Promise<void> {
    // If multiple events then loop back
    if (Array.isArray(signedEvents)) {
      for (const signedEvent of signedEvents) {
        await this.save(signedEvent);
      }
    } else {
      const signedEvent = signedEvents;

      if (!signedEvent.signature || signedEvent.signature.length === 0) {
        throw new DatabaseError('SignedEvent must have a valid signature');
      }

      if (!signedEvent.eventBytes || signedEvent.eventBytes.length === 0) {
        throw new DatabaseError('SignedEvent must have valid event data');
      }

      await this.repository.save(signedEvent);
    }
  }

  async getAll(): Promise<Proto.SignedEvent[]> {
    return this.repository.getAll();
  }

  async getBatch(
    batchSize: number,
    offset?: number,
  ): Promise<{
    events: Proto.SignedEvent[];
    offset: number;
  }> {
    return this.repository.getBatch(batchSize, offset);
  }

  async getNextSequence(
    publicKey: Proto.PublicKey,
    collection: number,
    identity: string,
  ): Promise<bigint> {
    return this.repository.getNextSequence(publicKey, collection, identity);
  }

  async getLatestEvent(
    publicKey: Proto.PublicKey,
    identity: string,
  ): Promise<Proto.SignedEvent | null> {
    return this.repository.getLatestEvent(publicKey, identity);
  }

  async getEventsByIdentity(
    publicKey: Proto.PublicKey,
    identity: string,
  ): Promise<Proto.SignedEvent[]> {
    return this.repository.getEventsByIdentity(publicKey, identity);
  }
}

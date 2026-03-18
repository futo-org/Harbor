import { IEventRepository } from '../platform-interfaces';
import { SignedEvent } from '../proto/polycentric';
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

  /**
   * Persist a single event
   *
   * @param signedEvent - A signed event to persist
   * @throws {DatabaseError} If the event is invalid or persisting fails
   */
  async persistEvent(signedEvent: SignedEvent): Promise<void> {
    // TODO: add more sophisticated event validation
    // TODO: will need to return a bool so rs-core doesn't ingest a malfmored event

    if (!signedEvent.signature || signedEvent.signature.length === 0) {
      throw new DatabaseError('SignedEvent must have a valid signature');
    }

    if (!signedEvent.event || signedEvent.event.length === 0) {
      throw new DatabaseError('SignedEvent must have valid event data');
    }

    await this.repository.persistEvent(signedEvent);
  }

  /**
   * Persist multiple signed events in a single database transaction.
   *
   * @param signedEvents - An array of signed events to persist
   * @throws {DatabaseError} If any event is invalid or the transaction fails
   */
  async persistEvents(signedEvents: SignedEvent[]): Promise<void> {
    // TODO: add more sophisticated event validation

    for (const signedEvent of signedEvents) {
      if (!signedEvent) {
        throw new DatabaseError('SignedEvent cannot be null or undefined');
      }
    }

    await this.repository.persistEvents(signedEvents);
  }

  /**
   * Get all events from the repository
   *
   * @returns An array of signed events
   */
  async getAllEvents(): Promise<SignedEvent[]> {
    return this.repository.getAllEvents();
  }

  /**
   * Get events in batches, ordered by id
   *
   * @param batchSize The number of events to retrieve
   * @param offset The offset from which to start retrieving events
   * @returns An object containing an array of signed events and the new offset
   */
  async getEventsBatch(
    batchSize: number,
    offset?: number,
  ): Promise<{
    events: SignedEvent[];
    offset: number;
  }> {
    return this.repository.getEventsBatch(batchSize, offset);
  }
}

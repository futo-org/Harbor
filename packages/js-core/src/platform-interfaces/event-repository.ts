import { SignedEvent } from "../proto/polycentric";

/**
 * EventRepository interface for storing and retrieving signed events in a database
 */
export interface IEventRepository {
  /**
   * Persist a single event
   *
   * @param signedEvent - A signed event to persist
   * @throws {Error} If the event is invalid or persisting fails
   */
  persistEvent(signedEvent: SignedEvent): Promise<void>;

  /**
   * Persist multiple events in a single database transaction.
   *
   * @param signedEvents - An array of signed events to persist
   * @throws {Error} If any event is invalid or the transaction fails
   */
  persistEvents(signedEvents: SignedEvent[]): Promise<void>;

  /**
   * Get all events from the repository
   *
   * @returns An array of signed events
   */
  getAllEvents(): Promise<SignedEvent[]>;

  /**
   * Get events in batches, ordered by id
   *
   * @param batchSize The number of events to retrieve
   * @param offset The offset from which to start retrieving events
   * @returns An object containing an array of signed events and the new offset
   */
  getEventsBatch(
    batchSize: number,
    offset?: number,
  ): Promise<{
    events: SignedEvent[];
    offset: number;
  }>;
}

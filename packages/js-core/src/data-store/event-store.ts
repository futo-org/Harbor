import {
  type EventKey,
  EventRepositoryError,
  type EventRow,
  type IEventRepository,
} from '../platform-interfaces/event-repository';
import * as Proto from '../proto/v2';

/**
 * EventStore wraps a platform's event repository with shared input validation.
 * All functions throw `EventRepositoryError` on failure.
 *
 * TODO: add actual validation.
 * Maybe also incude some derived data that would be done by most callers anyway.
 */
export class EventStore {
  constructor(private readonly repository: IEventRepository) {}

  /**
   * Try persisted a newly created event/content bundle.
   * This may fail if a concurrent session is also creating events.
   */
  async create(
    owner: string,
    event: Proto.SignedEvent,
    contentBytes: Uint8Array,
  ): Promise<void> {
    await this.repository.insert({
      owner,
      eventKey: eventKeyOf(event),
      eventBytes: event.eventBytes,
      eventSignature: event.signature,
      contentStatus: 'present',
      contentBytes,
    });
  }

  /**
   * Try persisting the event and/or content that we have received from a
   * remote source.
   */
  async persist(
    owner: string,
    event: Proto.SignedEvent,
    contentBytes?: Uint8Array,
  ): Promise<void> {
    const eventKey = eventKeyOf(event);

    const existing = await this.repository.get(owner, eventKey);
    if (!existing) {
      await this.repository.insert({
        owner,
        eventKey,
        eventBytes: event.eventBytes,
        eventSignature: event.signature,
        contentStatus: contentBytes ? 'present' : 'absent',
        contentBytes,
      });
    }

    // Content that was deliberately omitted stays omitted.
    if (contentBytes && existing?.contentStatus === 'absent') {
      await this.repository.addContent(owner, eventKey, contentBytes);
    }
  }

  // ---- Wrappers ----

  async addContent(
    owner: string,
    eventKey: EventKey,
    serializedContent: Uint8Array,
  ): Promise<void> {
    await this.repository.addContent(owner, eventKey, serializedContent);
  }

  async deleteContent(owner: string, eventKey: EventKey): Promise<void> {
    await this.repository.deleteContent(owner, eventKey);
  }

  async get(owner: string, eventKey: EventKey): Promise<EventRow | null> {
    return this.repository.get(owner, eventKey);
  }

  async getAll(owner: string): Promise<EventRow[]> {
    return this.repository.getAll(owner);
  }

  async getHeads(owner: string): Promise<EventKey[]> {
    return this.repository.getHeads(owner);
  }
}

/**
 * Decode the event key from a signed event.
 */
function eventKeyOf(event: Proto.SignedEvent): EventKey {
  let decoded: Proto.Event;
  try {
    decoded = Proto.Event.fromBinary(event.eventBytes);
  } catch (error) {
    throw new EventRepositoryError('invalid event', 'malformed event bytes', {
      cause: error,
    });
  }

  const key = decoded.key;
  if (!key?.signedBy) {
    throw new EventRepositoryError('invalid event', 'event key is incomplete');
  }

  return { ...key, signedBy: key.signedBy };
}

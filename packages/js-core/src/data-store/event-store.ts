import type {
  EventKey,
  EventRow,
  IEventRepository,
} from '../platform-interfaces/event-repository';

/**
 * EventStore wraps a platform's event repository with shared input validation.
 * All functions throw `EventRepositoryError` on failure.
 *
 * TODO: add actual validation.
 * Maybe also incude some derived data that would be done by most callers anyway.
 */
export class EventStore {
  constructor(private readonly repository: IEventRepository) {}

  async insert(row: EventRow): Promise<void> {
    await this.repository.insert(row);
  }

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

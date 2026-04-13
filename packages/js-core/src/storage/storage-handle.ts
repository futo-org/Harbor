import { EventStore } from './event-store';
import { ContentStore } from './content.store';
import { KeysStore } from './keys-store';
import { EventAckStore } from './event-ack-store';
import type { IEventRepository } from '../platform-interfaces/event.repository';
import type { IContentRepository } from '../platform-interfaces/content.repository';
import type { IKeysRepository } from '../platform-interfaces/keys-repository';
import type { IEventAckRepository } from '../platform-interfaces/event-ack-repository';

export interface Repositories {
  eventRepository: IEventRepository;
  contentRepository: IContentRepository;
  keysRepository: IKeysRepository;
  eventAckRepository: IEventAckRepository;
}

/**
 * StorageHandle provides an interface for data persistence operations.
 *
 * Storage wraps the raw repositories with business logic stores and provides
 * access to both the raw repositories and the business logic stores.
 *
 * Application code should always use the primary events,
 * content, and keys properties, not the raw repositories.
 *
 * Usage:
 * ```typescript
 * // Access business logic stores
 * await storage.events.save(signedEvent);
 * await storage.content.save(digest, bytes);
 * ```
 */
export class StorageHandle {
  public readonly _repositories: Repositories;
  public readonly events: EventStore;
  public readonly content: ContentStore;
  public readonly keys: KeysStore;
  public readonly eventAcks: EventAckStore;

  constructor(repositories: Repositories) {
    this._repositories = repositories;
    this.events = new EventStore(this._repositories.eventRepository);
    this.content = new ContentStore(this._repositories.contentRepository);
    this.keys = new KeysStore(this._repositories.keysRepository);
    this.eventAcks = new EventAckStore(this._repositories.eventAckRepository);
  }
}

import { EventStore } from './event-store';
import { ContentStore } from './content.store';
import { LoginStore } from './login-store';
import type { IEventRepository } from '../platform-interfaces/event.repository';
import type { IContentRepository } from '../platform-interfaces/content.repository';
import type { ILoginRepository } from '../platform-interfaces/login-repository';

export interface Repositories {
  eventRepository: IEventRepository;
  contentRepository: IContentRepository;
  loginRepository: ILoginRepository;
}

/**
 * StorageHandle provides an interface for data persistence operations.
 *
 * Storage wraps the raw repositories with business logic stores and provides
 * access to both the raw repositories and the business logic stores.
 *
 * Application code should always use the primary events,
 * content, and logins properties, not the raw repositories.
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
  public readonly logins: LoginStore;

  constructor(repositories: Repositories) {
    this._repositories = repositories;
    this.events = new EventStore(this._repositories.eventRepository);
    this.content = new ContentStore(this._repositories.contentRepository);
    this.logins = new LoginStore(this._repositories.loginRepository);
  }
}

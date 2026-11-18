import { EventStore } from './event-store';
import { LoginStore } from './login-store';
import type { IEventRepository } from '../platform-interfaces/event-repository';
import type { ILoginRepository } from '../platform-interfaces/login-repository';

/** The platform repositories a `StorageHandle` wraps. */
export interface Repositories {
  eventRepository: IEventRepository;
  loginRepository: ILoginRepository;
}

/**
 * StorageHandle provides an interface for data persistence operations.
 *
 * Storage wraps the raw repositories with business logic stores and provides
 * access to both the raw repositories and the business logic stores.
 *
 * Application code should always use the `events` and `logins` stores, not
 * the raw repositories.
 *
 * Usage:
 * ```typescript
 * await client.storage.events.persist(owner, signedEvent, contentBytes);
 * const logins = await client.storage.logins.listLogins();
 * ```
 */
export class StorageHandle {
  /** The raw platform repositories. Bypasses validation; avoid in app code. */
  public readonly _repositories: Repositories;
  /** Validated access to persisted events and content. */
  public readonly events: EventStore;
  /** Validated access to persisted logins (key pairs). */
  public readonly logins: LoginStore;

  constructor(repositories: Repositories) {
    this._repositories = repositories;
    this.events = new EventStore(this._repositories.eventRepository);
    this.logins = new LoginStore(this._repositories.loginRepository);
  }
}

import type { IEventRepository } from './event-repository';
import type { ILoginRepository, LoginId } from './login-repository';

/**
 * Entry point a platform implements to give `PolycentricClient` persistent
 * storage. The client calls the repository factories once during
 * initialization.
 */
export interface IStorageDriver {
  /** Create the event/content repository used by `EventStore`. */
  createEventRepository: () => IEventRepository;
  /** Create the login (key pair) repository used by `LoginStore`. */
  createLoginRepository: () => ILoginRepository;
  /** Persist which login is active, or `null` when logged out. */
  setActiveLogin: (login: LoginId | null) => Promise<void>;
  /** The persisted active login, restored by the client on startup. */
  getActiveLogin: () => Promise<LoginId | null>;
}

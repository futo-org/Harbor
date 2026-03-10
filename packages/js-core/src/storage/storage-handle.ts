import { EventStore } from "./event-store";
import { ProcessStateStore } from "./process-state-store";
import { KeysStore } from "./keys-store";
import { EventAckStore } from "./event-ack-store";
import { ProcessIdStore } from "./process-id-store";
import type { IEventRepository } from "../platform-interfaces/event-repository";
import type { IProcessStateRepository } from "../platform-interfaces/process-state-repository";
import type { IKeysRepository } from "../platform-interfaces/keys-repository";
import type { IEventAckRepository } from "../platform-interfaces/event-ack-repository";
import type { IProcessIdRepository } from "../platform-interfaces/process-id-repository";

/**
 * Repositories interface for the storage layer
 *
 * Contains the raw repository implementations provided by platforms.
 */
export interface Repositories {
  eventRepository: IEventRepository;
  processStateRepository: IProcessStateRepository;
  keysRepository: IKeysRepository;
  eventAckRepository: IEventAckRepository;
  processIdRepository: IProcessIdRepository;
}

/**
 * StorageHandle provides an interface for data persistence operations.
 *
 * Storage wraps the raw repositories with business logic stores and provides
 * access to both the raw repositories and the business logic stores.
 *
 * Application code should always use the primary events,
 * processStates, and keys properties, not the raw repositories.
 *
 * Usage:
 * ```typescript
 * // Access raw repositories directly
 * await storage._repositories.eventRepository;
 *
 * // Access business logic stores
 * await storage.events.persistEvent(signedEvent);
 * ```
 */
export class StorageHandle {
  public readonly _repositories: Repositories;
  public readonly events: EventStore;
  public readonly processStates: ProcessStateStore;
  public readonly keys: KeysStore;
  public readonly processId: ProcessIdStore;
  public readonly eventAcks: EventAckStore;

  constructor(repositories: Repositories) {
    this._repositories = repositories;
    this.events = new EventStore(this._repositories.eventRepository);
    this.processStates = new ProcessStateStore(
      this._repositories.processStateRepository,
    );
    this.keys = new KeysStore(this._repositories.keysRepository);
    this.eventAcks = new EventAckStore(this._repositories.eventAckRepository);
    this.processId = new ProcessIdStore(this._repositories.processIdRepository);
  }
}

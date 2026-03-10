import type { Database } from './database';
import { EventRepository } from './repositories/event-repository';
import { IdentityRepository } from './repositories/identity-repository';
import { CurrentIdentityRepository } from './repositories/current-identity-repository';
import { ProcessStateRepository } from './repositories/process-state-repository';
import { ProcessIdRepository } from './repositories/process-id-repository';
import { EventAckRepository } from './repositories/event-ack-repository';

export class StorageHandle {
  readonly events: EventRepository;
  readonly identities: IdentityRepository;
  readonly currentIdentity: CurrentIdentityRepository;
  readonly processStates: ProcessStateRepository;
  readonly processId: ProcessIdRepository;
  readonly eventAcks: EventAckRepository;

  constructor(database: Database) {
    this.events = new EventRepository(database);
    this.identities = new IdentityRepository(database);
    this.currentIdentity = new CurrentIdentityRepository(database);
    this.processStates = new ProcessStateRepository(database);
    this.processId = new ProcessIdRepository(database);
    this.eventAcks = new EventAckRepository(database);
  }
}

import type { IEventRepository } from './event-repository';
import type { IProcessStateRepository } from './process-state-repository';
import type { IKeysRepository } from './keys-repository';
import type { IEventAckRepository } from './event-ack-repository';
import type { IProcessIdRepository } from './process-id-repository';

export interface IStorageDriver {
  createEventRepository: () => IEventRepository;
  createProcessStateRepository: () => IProcessStateRepository;
  createKeysRepository: () => IKeysRepository;
  createEventAckRepository: () => IEventAckRepository;
  createProcessIdRepository: () => IProcessIdRepository;
}

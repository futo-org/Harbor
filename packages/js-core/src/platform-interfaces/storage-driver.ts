import type { IEventRepository } from './event.repository';
import type { IContentRepository } from './content.repository';
import type { IKeysRepository } from './keys-repository';
import type { IEventAckRepository } from './event-ack-repository';

export interface IStorageDriver {
  createEventRepository: () => IEventRepository;
  createContentRepository: () => IContentRepository;
  createKeysRepository: () => IKeysRepository;
  createEventAckRepository: () => IEventAckRepository;
}

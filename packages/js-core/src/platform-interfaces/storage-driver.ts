import type { IEventRepository } from './event.repository';
import type { IContentRepository } from './content.repository';
import type { IKeysRepository } from './keys-repository';
import type { IEventAckRepository } from './event-ack-repository';

export interface IStorageDriver {
  createEventRepository: () => IEventRepository;
  createContentRepository: () => IContentRepository;
  createKeysRepository: () => IKeysRepository;
  createEventAckRepository: () => IEventAckRepository;
  /** Persist which v2 identity is active for this signing public key (Ed25519: 32 bytes). */
  saveActiveIdentityKey: (
    publicKey: Uint8Array,
    identityKey: string | null,
  ) => void;
  loadActiveIdentityKey: (publicKey: Uint8Array) => string | null;
}

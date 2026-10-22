import type { IEventRepository } from './event.repository';
import type { IContentRepository } from './content.repository';
import type { ILoginRepository } from './login-repository';
import type { v2 } from '..';

export interface ActiveLogin {
  identity: string;
  publicKey: v2.PublicKey;
}

export interface IStorageDriver {
  createEventRepository: () => IEventRepository;
  createContentRepository: () => IContentRepository;
  createLoginRepository: () => ILoginRepository;
  setActiveLogin: (login: ActiveLogin | null) => Promise<void>;
  getActiveLogin: () => Promise<ActiveLogin | null>;
}

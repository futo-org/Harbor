import type { IEventRepository } from './event.repository';
import type { IContentRepository } from './content.repository';
import type { ILoginRepository, LoginId } from './login-repository';

export interface IStorageDriver {
  createEventRepository: () => IEventRepository;
  createContentRepository: () => IContentRepository;
  createLoginRepository: () => ILoginRepository;
  setActiveLogin: (login: LoginId | null) => Promise<void>;
  getActiveLogin: () => Promise<LoginId | null>;
}

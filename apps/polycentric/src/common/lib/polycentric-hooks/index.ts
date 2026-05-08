// Provider and base hooks
export {
  PolycentricProvider,
  usePolycentric,
  usePolycentricContext,
  DEFAULT_SERVER,
  DEFAULT_SEED_SERVERS,
} from './PolycentricProvider';

// Data query hooks
export { useUsername } from './PolycentricProvider';

// Action hooks
export { useCurrentIdentity, useIdentities } from './PolycentricProvider';

// Store
export { useStore } from './store';
export type { PolycentricStore, PolycentricStoreApi } from './store';

// Profile screen hooks
export {
  useProfileEdit,
  type ProfileEditState,
} from '../../../features/profile/hooks/useProfileEdit';

// Local post injection (composer → live feeds)
export { useLocalPosts as useLocalPostInjection } from '../../../features/post/hooks/useLocalPosts';

// Helpers
export {
  decodePostBundle as decodeV2PostBundle,
  pubkeyStr,
  identiconUrl,
  pickImageVariant,
  timeAgo,
  bytesToHex,
  hexToBytes,
  truncateName,
  publicKeyToString,
  stringToPublicKey,
  publicKeyToStringURLSafe,
  stringURLSafeToPublicKey,
  getIdentityId,
  getIdentityIdShort,
  shortenIdentityId,
  signedEventToHex,
  hexToSignedEvent,
  toBase64,
  fromBase64,
} from './helpers';
export type { PostData } from './helpers';

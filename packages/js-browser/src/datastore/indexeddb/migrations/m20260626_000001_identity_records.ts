import {
  KEY_TYPE,
  hexToBytes,
  v2,
  type IStorageDriver,
} from '@polycentric/js-core';

export const name = 'm20260626_000001_identity_records';

export async function up(driver: IStorageDriver): Promise<void> {
  const identityRepository = driver.createIdentityRepository();
  const legacy = readLegacyActiveIdentities();
  const heldKeysByIdentity = groupHeldKeysByIdentity(legacy.entries);

  for (const [identityKey, heldKeys] of heldKeysByIdentity) {
    await identityRepository.saveRecord({
      identityKey,
      heldKeys,
      updatedAt: Date.now(),
    });
  }

  for (const storageKey of legacy.storageKeys) {
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.warn(
        `Migration: failed to remove legacy storage key "${storageKey}"`,
        err,
      );
    }
  }
}

// Active identity was previously stored in localStorage per public key:
// `polycentric:activeIdentity:<publicKeyHex>`
const LEGACY_ACTIVE_PREFIX = 'polycentric:activeIdentity:';

type LegacyActiveIdentityEntry = {
  storageKey: string;
  identityKey: string;
  publicKey: v2.PublicKey;
};

function readLegacyActiveIdentities(): {
  entries: LegacyActiveIdentityEntry[];
  storageKeys: string[];
} {
  const entries: LegacyActiveIdentityEntry[] = [];
  const storageKeys: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (!storageKey?.startsWith(LEGACY_ACTIVE_PREFIX)) continue;

      storageKeys.push(storageKey);
      const identityKey = localStorage.getItem(storageKey);
      if (!identityKey) continue;

      entries.push({
        storageKey,
        identityKey,
        publicKey: publicKeyFromLegacyStorageKey(storageKey),
      });
    }
  } catch (err) {
    console.warn(
      'Migration: localStorage is not accessible; skipping legacy identity migration',
      err,
    );
  }

  return { entries, storageKeys };
}

function groupHeldKeysByIdentity(entries: LegacyActiveIdentityEntry[]) {
  const heldKeysByIdentity = new Map<string, v2.PublicKey[]>();

  for (const entry of entries) {
    const heldKeys = heldKeysByIdentity.get(entry.identityKey);
    if (heldKeys) {
      heldKeys.push(entry.publicKey);
    } else {
      heldKeysByIdentity.set(entry.identityKey, [entry.publicKey]);
    }
  }

  return heldKeysByIdentity;
}

function publicKeyFromLegacyStorageKey(storageKey: string): v2.PublicKey {
  return v2.PublicKey.create({
    keyType: KEY_TYPE.ED25519,
    key: hexToBytes(storageKey.slice(LEGACY_ACTIVE_PREFIX.length)),
  });
}

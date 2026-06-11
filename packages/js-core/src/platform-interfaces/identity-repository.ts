import type { PublicKey } from '../proto/v2';

/** Per-identity record of the public keys this client holds for it. */
export interface IdentityRecord {
  /** The identity key (hex-encoded sha256 of the initial Identity content). */
  identityKey: string;
  /** Public keys held on this client that we associate with the identity. */
  heldKeys: PublicKey[];
  /** Epoch milliseconds the record was last written. */
  updatedAt: number;
}

/**
 * IdentityRepository persists, per identity this client participates in, the
 * public keys this client holds for it.
 */
export interface IIdentityRepository {
  getRecord(identityKey: string): Promise<IdentityRecord | null>;
  saveRecord(record: IdentityRecord): Promise<void>;
  getAllRecords(): Promise<IdentityRecord[]>;
}

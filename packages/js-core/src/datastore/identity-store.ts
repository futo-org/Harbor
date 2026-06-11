import type {
  IIdentityRepository,
  IdentityRecord,
} from '../platform-interfaces/identity-repository';

/**
 * Wraps IIdentityRepository, matching the client's store-to-repository delegation pattern.
 */
export class IdentityStore {
  constructor(private repository: IIdentityRepository) {}

  async getRecord(identityKey: string): Promise<IdentityRecord | null> {
    return this.repository.getRecord(identityKey);
  }

  async saveRecord(record: IdentityRecord): Promise<void> {
    await this.repository.saveRecord(record);
  }

  async getAllRecords(): Promise<IdentityRecord[]> {
    return this.repository.getAllRecords();
  }

  /** The most-recently-updated identity record, or null if there are none. */
  async getMostRecent(): Promise<IdentityRecord | null> {
    const records = await this.repository.getAllRecords();
    if (records.length === 0) return null;
    return records.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  }
}

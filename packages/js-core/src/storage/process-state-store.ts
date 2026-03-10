import { IProcessStateRepository } from "../platform-interfaces";

/**
 * ProcessState provides operations for the logical clock of a given process.
 *
 * ProcessState wraps an IProcessStateRepository and provides business logic validation.
 */
export class ProcessStateStore {
  constructor(private repository: IProcessStateRepository) {}

  /**
   * Persist the logical clock for a given process.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock value to persist
   */
  async persistCurrentLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
  ): Promise<void> {
    // TODO: Business logic validation.

    await this.repository.persistCurrentLogicalClock(
      systemKeyType,
      systemKey,
      process,
      logicalClock,
    );
  }

  /**
   * Get the current logical clock for a given process.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @returns Promise that resolves to the current logical clock or 0 if not found
   */
  async getCurrentLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
  ): Promise<bigint> {
    // TODO: Business logic validation.

    return await this.repository.getCurrentLogicalClock(
      systemKeyType,
      systemKey,
      process,
    );
  }

  /**
   * Convenience method to determine the next logical clock for a given process.
   *
   * Note: This method does not persist the new logical clock value.
   * Use persistCurrentLogicalClock to persist the new logical clock value.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @returns Promise that resolves to the next logical clock value
   */
  async getNextLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
  ): Promise<bigint> {
    // TODO: Business logic validation.

    return await this.repository.getNextLogicalClock(
      systemKeyType,
      systemKey,
      process,
    );
  }
}

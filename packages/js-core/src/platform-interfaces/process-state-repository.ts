/**
 * ProcessStateRepository interface for managing process state in a database
 */
export interface IProcessStateRepository {
  /**
   * Persist the logical clock for a specific process.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param logicalClock - The logical clock value to persist
   * @throws {Error} If the operation fails
   */
  persistCurrentLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    logicalClock: bigint,
  ): Promise<void>;

  /**
   * Get the current logical clock for a given process.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @returns Promise that resolves to the current logical clock or 0 if not found
   * @throws {Error} If the query fails
   */
  getCurrentLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
  ): Promise<bigint>;

  /**
   * Convenience method to determine the next logical clock for a given process.
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @returns Promise that resolves to the next logical clock value
   * @throws {Error} If the operation fails
   */
  getNextLogicalClock(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
  ): Promise<bigint>;
}

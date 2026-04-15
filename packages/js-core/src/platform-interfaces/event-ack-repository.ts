/**
 * EventAckRepository interface for storing and retrieving event acknowledgments in a database
 */
export interface IEventAckRepository {
  /**
   * Store an event acknowledgment
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param sequence - The sequence of the acknowledged event
   * @param serverUrl - The server URL that acknowledged the event
   * @throws {Error} If storing fails
   */
  storeEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
    serverUrl: string,
  ): Promise<void>;

  /**
   * Retrieve event acknowledgments for a specific event
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param sequence - The sequence of the event
   * @returns Promise that resolves to an array of server URLs that acknowledged the event
   */
  getEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
  ): Promise<string[]>;

  /**
   * Check if a specific event has been acknowledged by a specific server
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param sequence - The sequence of the event
   * @param serverUrl - The server URL to check
   * @returns Promise that resolves to true if acknowledged, false otherwise
   */
  hasEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
    serverUrl: string,
  ): Promise<boolean>;

  /**
   * Remove event acknowledgments for a specific event
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param sequence - The sequence of the event
   * @throws {Error} If removal fails
   */
  removeEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
  ): Promise<void>;
}

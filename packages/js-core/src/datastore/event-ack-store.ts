import { IEventAckRepository } from '../platform-interfaces';

/**
 * EventAckStore provides operations for managing event acknowledgments.
 *
 * EventAckStore wraps an IEventAckRepository and provides business logic validation.
 */
export class EventAckStore {
  constructor(private repository: IEventAckRepository) {}

  /**
   * Store an event acknowledgment
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param sequence - The sequence of the acknowledged event
   * @param serverUrl - The server URL that acknowledged the event
   */
  async storeEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
    serverUrl: string,
  ): Promise<void> {
    // TODO: Business logic validation.

    await this.repository.storeEventAck(
      systemKeyType,
      systemKey,
      process,
      sequence,
      serverUrl,
    );
  }

  /**
   * Retrieve event acknowledgments for a specific event
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param sequence - The sequence of the event
   * @returns Promise that resolves to an array of server URLs that acknowledged the event
   */
  async getEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
  ): Promise<string[]> {
    // TODO: Business logic validation.

    return await this.repository.getEventAcks(
      systemKeyType,
      systemKey,
      process,
      sequence,
    );
  }

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
  async hasEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
    serverUrl: string,
  ): Promise<boolean> {
    // TODO: Business logic validation.

    return await this.repository.hasEventAck(
      systemKeyType,
      systemKey,
      process,
      sequence,
      serverUrl,
    );
  }

  /**
   * Remove event acknowledgments for a specific event
   *
   * @param systemKeyType - The system key type
   * @param systemKey - The system key bytes
   * @param process - The process ID bytes
   * @param sequence - The sequence of the event
   */
  async removeEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
  ): Promise<void> {
    // TODO: Business logic validation.

    await this.repository.removeEventAcks(
      systemKeyType,
      systemKey,
      process,
      sequence,
    );
  }
}

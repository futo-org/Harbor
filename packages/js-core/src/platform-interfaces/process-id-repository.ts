import { Process } from '../proto/polycentric';

/**
 * ProcessIdentifierRepository interface for managing the device's process ID
 */
export interface IProcessIdRepository {
  /**
   * Get the device's process ID
   *
   * @returns Promise that resolves to the process ID, or null if not set
   */
  getProcessId(): Promise<Process | null>;

  /**
   * Set the device's process ID
   *
   * @param processId - The process ID to store
   * @throws {Error} If storing fails
   */
  setProcessId(processId: Process): Promise<void>;
}

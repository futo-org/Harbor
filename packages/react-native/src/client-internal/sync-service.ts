/**
 * High-level sync loop that performs network requests.
 */
import { polycentric, polycentric_ffi } from '../generated/protocol';
import type { PolycentricClient } from '../polycentric-client';

export class SyncService {
  constructor(private readonly client: PolycentricClient) {}

  async sync(): Promise<{ errors: string[] }> {
    const result = await this.client.ffiBridge.syncEventsForSystem(
      this.client.currentSystem
    );

    if (result.result === 'error' && result.error) {
      throw new Error(`Sync error: ${result.error}`);
    }

    if (result.value && result.value.length > 0) {
      const syncResult = polycentric_ffi.ResultAndServerErrors.decode(
        result.value
      );

      // Persist synced events to local database
      if (
        syncResult.result &&
        syncResult.result.length > 0 &&
        this.client.storage
      ) {
        try {
          const events = polycentric.Events.decode(syncResult.result);
          if (events.events) {
            this.client.storage.events.persistEvents(events.events);
          }
        } catch (error) {
          console.warn('Failed to persist synced events:', error);
        }
      }

      const errors = syncResult.errors.map(
        (e) => `${e.server ?? 'unknown'}: ${e.error ?? 'unknown error'}`
      );
      return { errors };
    }

    return { errors: [] };
  }
}

import { Events, PublicKey } from '../proto/polycentric';
import { PolycentricClient } from '../polycentric-client';
import { ServerError } from '../utils';

export class SyncService {
  constructor(private readonly client: PolycentricClient) {}

  private async _persistEventsCallback(eventsBytes: Uint8Array) {
    const events = Events.fromBinary(eventsBytes);
    await this.client.storage.events.persistEvents(events.events);
  }

  /**
   * Synchronizes the client's events with those of the selected servers
   */
  public async sync(): Promise<ServerError[]> {
    let result = (await this.client.wasmCore.sync_events_for_system(
      PublicKey.toBinary(this.client.currentIdentity.keyPair.publicKey),
      this.client.httpClient.getHead.bind(this.client.httpClient),
      this.client.httpClient.getRanges.bind(this.client.httpClient),
      this.client.httpClient.getEvents.bind(this.client.httpClient),
      this.client.httpClient.postEvents.bind(this.client.httpClient),
      this._persistEventsCallback.bind(this),
    )) as any;

    return result.errors;
  }
}

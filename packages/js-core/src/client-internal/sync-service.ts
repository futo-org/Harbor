import { PublicKey } from '../proto/polycentric';
import { PolycentricClient } from '../polycentric-client';
import { ServerError } from '../utils';

export class SyncService {
  constructor(private readonly client: PolycentricClient) {}

  /**
   * Synchronizes the client's events with those of the selected servers
   */
  public async sync(): Promise<ServerError[]> {
    return this.client.syncEventsForSystem(
      PublicKey.create(this.client.currentIdentity.keyPair.publicKey),
    );
  }
}

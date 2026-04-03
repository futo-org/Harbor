import type { PolycentricClient } from '../polycentric-client';
import { SignedEvent } from '../proto/polycentric/v2/events';

export class ContentManager {
  constructor(private readonly client: PolycentricClient) {}

  /**
   * Signs, verifies, and persists a v2 Event.
   *
   * @param eventBytes - Serialized v2 Event protobuf bytes
   * @returns The resulting signed event.
   */
  async createEvent(eventBytes: Uint8Array): Promise<SignedEvent> {
    if (!this.client.core) {
      throw new Error('Core is not initialized');
    }

    const signedEventBytes = await this.client.core.sign_and_persist_event(
      eventBytes,
      this.signEventCallback.bind(this),
      this.persistEventCallback.bind(this),
    );
    const signedEvent = SignedEvent.fromBinary(signedEventBytes);
    this.client.events.emitContentCreated(signedEvent);
    return signedEvent;
  }

  private async signEventCallback(eventBytes: Uint8Array): Promise<Uint8Array> {
    if (!this.client.currentKeyPair) {
      throw new Error('No keypair');
    }
    const signature = await this.client.crypto.sign(
      this.client.currentKeyPair.privateKey.key,
      eventBytes,
      this.client.currentKeyPair.keyType,
    );
    const signedEvent = SignedEvent.create({
      signature,
      eventBytes,
    });
    return SignedEvent.toBinary(signedEvent);
  }

  private async persistEventCallback(
    signedEventBytes: Uint8Array,
  ): Promise<void> {
    const signedEvent = SignedEvent.fromBinary(signedEventBytes);
    await this.client.storage.events.persistEvent(signedEvent);
  }
}

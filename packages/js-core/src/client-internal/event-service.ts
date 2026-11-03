import EventEmitter from 'eventemitter3';
import type { KeyPair } from '../polycentric-client';
import type { SignedEvent } from '../proto/polycentric/v2/events';
import type { Content } from '../proto/polycentric/v2/content';

export type ContentCreatedPayload = {
  signedEvent: SignedEvent;
  /** Present when the commit included content. */
  content?: Content;
};

// For type safety, this interface maps event names to their payload types
interface EventMap {
  identityChanged: KeyPair | null;
  contentCreated: ContentCreatedPayload;
  pulled: string; // Identity key of the sync/pull
}

export class EventService {
  private emitter = new EventEmitter();

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
    this.emitter.emit(event, payload);
  }

  private on<K extends keyof EventMap>(
    event: K,
    listener: (payload: EventMap[K]) => void,
  ) {
    this.emitter.on(event, listener);
  }

  private off<K extends keyof EventMap>(
    event: K,
    listener: (payload: EventMap[K]) => void,
  ) {
    this.emitter.off(event, listener);
  }

  // KeyPair events
  emitKeyPairChanged(identity: KeyPair | null) {
    this.emit('identityChanged', identity);
  }
  onKeyPairChanged(listener: (identity: KeyPair | null) => void) {
    this.on('identityChanged', listener);
  }
  offKeyPairChanged(listener: (identity: KeyPair | null) => void) {
    this.off('identityChanged', listener);
  }

  // Content events
  emitContentCreated(payload: ContentCreatedPayload) {
    this.emit('contentCreated', payload);
  }
  onContentCreated(listener: (payload: ContentCreatedPayload) => void) {
    this.on('contentCreated', listener);
  }
  offContentCreated(listener: (payload: ContentCreatedPayload) => void) {
    this.off('contentCreated', listener);
  }

  // Pull events
  emitPulled(identityKey: string) {
    this.emit('pulled', identityKey);
  }
  onPulled(listener: (identityKey: string) => void) {
    this.on('pulled', listener);
  }
  offPulled(listener: (identityKey: string) => void) {
    this.off('pulled', listener);
  }

  // Utility methods for cleanup
  public removeAllListeners() {
    this.emitter.removeAllListeners();
  }

  public removeAllListenersForEvent<K extends keyof EventMap>(event: K) {
    this.emitter.removeAllListeners(event);
  }
}

import EventEmitter from 'eventemitter3';
import type { KeyPair } from '../polycentric-client';
import type { SignedEvent } from '../proto/polycentric/v2/events';
import type { Content } from '../proto/polycentric/v2/content';
import type { EventPushIssues } from '@polycentric/rs-core-wasm';

/** Payload of the `contentCreated` event, emitted when an event is committed locally. */
export type ContentCreatedPayload = {
  signedEvent: SignedEvent;
  /** Present when the commit included content. */
  content?: Content;
};

/** The outcome of pushing an identity's events to one server. */
export type ServerPushResult = {
  // May no longer be the active identity by the time the push finishes
  identity: string;
  server: string;
  /** Events the server issued errors or warnings for. */
  eventIssues: EventPushIssues[];
  /** Set when the push failed outright, e.g. the server was unreachable. */
  error?: unknown;
};

// For type safety, this interface maps event names to their payload types
interface EventMap {
  identityChanged: KeyPair | null;
  contentCreated: ContentCreatedPayload;
  pulled: string; // Identity key of the sync/pull
  pushResults: ServerPushResult[]; // One per server pushed to by a sync
}

/**
 * Typed event emitter exposed as `client.events`. The client emits:
 * - `identityChanged` (`onKeyPairChanged`): on login/logout/switch, with the
 *   new key pair or `null`.
 * - `contentCreated`: after an event is committed to local storage.
 * - `pulled`: after a pull returned any events, with the identity key.
 * - `pushResults`: after a sync that pushes, one result per server.
 *
 * The `emit*` methods are for the client's own use.
 */
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
  /** Emit `identityChanged`. */
  emitKeyPairChanged(identity: KeyPair | null) {
    this.emit('identityChanged', identity);
  }
  /** Subscribe to active login changes (`null` on logout). */
  onKeyPairChanged(listener: (identity: KeyPair | null) => void) {
    this.on('identityChanged', listener);
  }
  /** Unsubscribe a listener added with `onKeyPairChanged`. */
  offKeyPairChanged(listener: (identity: KeyPair | null) => void) {
    this.off('identityChanged', listener);
  }

  // Content events
  /** Emit `contentCreated`. */
  emitContentCreated(payload: ContentCreatedPayload) {
    this.emit('contentCreated', payload);
  }
  /** Subscribe to events committed locally by this client. */
  onContentCreated(listener: (payload: ContentCreatedPayload) => void) {
    this.on('contentCreated', listener);
  }
  /** Unsubscribe a listener added with `onContentCreated`. */
  offContentCreated(listener: (payload: ContentCreatedPayload) => void) {
    this.off('contentCreated', listener);
  }

  // Pull events
  /** Emit `pulled`. */
  emitPulled(identityKey: string) {
    this.emit('pulled', identityKey);
  }
  /** Subscribe to pulls that returned events, keyed by identity. */
  onPulled(listener: (identityKey: string) => void) {
    this.on('pulled', listener);
  }
  /** Unsubscribe a listener added with `onPulled`. */
  offPulled(listener: (identityKey: string) => void) {
    this.off('pulled', listener);
  }

  // Push events
  /** Emit `pushResults`. */
  emitPushResults(results: ServerPushResult[]) {
    this.emit('pushResults', results);
  }
  /** Subscribe to per-server push outcomes of each pushing sync. */
  onPushResults(listener: (results: ServerPushResult[]) => void) {
    this.on('pushResults', listener);
  }
  /** Unsubscribe a listener added with `onPushResults`. */
  offPushResults(listener: (results: ServerPushResult[]) => void) {
    this.off('pushResults', listener);
  }

  /** Remove every listener for every event. */
  public removeAllListeners() {
    this.emitter.removeAllListeners();
  }

  /** Remove every listener for one event name. */
  public removeAllListenersForEvent<K extends keyof EventMap>(event: K) {
    this.emitter.removeAllListeners(event);
  }
}

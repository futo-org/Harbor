/**
 * Tests the basic functionality of the events service.
 */

import { describe, expect, it, vi } from 'vitest';
import { EventService } from './event-service';
import type { KeyPair } from '../polycentric-client';
import * as Proto from '../proto/v2';

const keyPair: KeyPair = {
  keyType: Proto.KeyType.ED25519,
  privateKey: { keyType: Proto.KeyType.ED25519, key: new Uint8Array(32) },
  publicKey: { keyType: Proto.KeyType.ED25519, key: new Uint8Array(32) },
};

type Listener = (payload: unknown) => void;

/** The wrapper methods and an emission payload for one event. */
type EventCase = {
  on: (events: EventService, listener: Listener) => void;
  off: (events: EventService, listener: Listener) => void;
  emit: (events: EventService) => void;
  payload: unknown;
};

const eventCases: Record<string, EventCase> = {
  keyPairChanged: {
    on: (e, l) => e.onKeyPairChanged(l),
    off: (e, l) => e.offKeyPairChanged(l),
    emit: (e) => e.emitKeyPairChanged(keyPair),
    payload: keyPair,
  },
  contentCreated: {
    on: (e, l) => e.onContentCreated(l),
    off: (e, l) => e.offContentCreated(l),
    emit: (e) =>
      e.emitContentCreated({ signedEvent: Proto.SignedEvent.create() }),
    payload: { signedEvent: Proto.SignedEvent.create() },
  },
  pulled: {
    on: (e, l) => e.onPulled(l),
    off: (e, l) => e.offPulled(l),
    emit: (e) => e.emitPulled('identity'),
    payload: 'identity',
  },
  pushResults: {
    on: (e, l) => e.onPushResults(l),
    off: (e, l) => e.offPushResults(l),
    emit: (e) =>
      e.emitPushResults([
        { identity: 'identity', server: 'http://a', eventIssues: [] },
      ]),
    payload: [{ identity: 'identity', server: 'http://a', eventIssues: [] }],
  },
};

const eventNames = Object.keys(eventCases);

/** Subscribe a fresh mock listener to every event. */
function listenToAll(events: EventService): Record<string, Listener> {
  const listeners: Record<string, Listener> = {};
  for (const name of eventNames) {
    listeners[name] = vi.fn();
    eventCases[name].on(events, listeners[name]);
  }
  return listeners;
}

describe('EventService', () => {
  it.each(eventNames)('delivers %s only to its own listeners', (name) => {
    const events = new EventService();
    const listeners = listenToAll(events);

    eventCases[name].emit(events);

    for (const other of eventNames) {
      if (other === name) {
        expect(listeners[other]).toHaveBeenCalledExactlyOnceWith(
          eventCases[name].payload,
        );
      } else {
        expect(listeners[other]).not.toHaveBeenCalled();
      }
    }
  });

  it.each(eventNames)('delivers %s to every listener', (name) => {
    const events = new EventService();
    const first = vi.fn();
    const second = vi.fn();
    eventCases[name].on(events, first);
    eventCases[name].on(events, second);

    eventCases[name].emit(events);

    expect(first).toHaveBeenCalledExactlyOnceWith(eventCases[name].payload);
    expect(second).toHaveBeenCalledExactlyOnceWith(eventCases[name].payload);
  });

  it.each(eventNames)(
    'stops delivering %s to a removed listener only',
    (name) => {
      const events = new EventService();
      const removed = vi.fn();
      const kept = vi.fn();
      eventCases[name].on(events, removed);
      eventCases[name].on(events, kept);

      eventCases[name].off(events, removed);
      eventCases[name].emit(events);

      expect(removed).not.toHaveBeenCalled();
      expect(kept).toHaveBeenCalledOnce();
    },
  );

  it('removeAllListeners silences every event', () => {
    const events = new EventService();
    const listeners = listenToAll(events);

    events.removeAllListeners();
    for (const name of eventNames) eventCases[name].emit(events);

    for (const name of eventNames) {
      expect(listeners[name]).not.toHaveBeenCalled();
    }
  });

  it('removeAllListenersForEvent silences only that event', () => {
    const events = new EventService();
    const listeners = listenToAll(events);

    events.removeAllListenersForEvent('pulled');
    for (const name of eventNames) eventCases[name].emit(events);

    for (const name of eventNames) {
      if (name === 'pulled') {
        expect(listeners[name]).not.toHaveBeenCalled();
      } else {
        expect(listeners[name]).toHaveBeenCalledOnce();
      }
    }
  });
});

import type { Identity } from '../polycentric-client';
import { polycentric } from '../generated/protocol';

export enum ClientState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error',
}

export enum InitializationStep {
  STARTING = 'Starting initialization...',
  INITIALIZING_FFI = 'Initializing FFI...',
  SETTING_UP_STORAGE = 'Setting up storage...',
  HYDRATING_EVENTS = 'Hydrating events...',
  COMPLETE = 'Initialization complete.',
}

interface EventMap {
  identityChanged: Identity | null;
  contentCreated: polycentric.SignedEvent;
  stateChanged: ClientState;
  progress: InitializationStep;
  error: Error;
}

type Listener<T> = (payload: T) => void;

export class EventService {
  private listeners = new Map<string, Set<Function>>();

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
    const set = this.listeners.get(event);
    if (set) {
      for (const fn of set) {
        fn(payload);
      }
    }
  }

  private on<K extends keyof EventMap>(
    event: K,
    listener: Listener<EventMap[K]>
  ) {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  private off<K extends keyof EventMap>(
    event: K,
    listener: Listener<EventMap[K]>
  ) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  // Identity events
  emitIdentityChanged(identity: Identity | null) {
    this.emit('identityChanged', identity);
  }
  onIdentityChanged(listener: Listener<Identity | null>) {
    this.on('identityChanged', listener);
  }
  offIdentityChanged(listener: Listener<Identity | null>) {
    this.off('identityChanged', listener);
  }

  // Content events
  emitContentCreated(event: polycentric.SignedEvent) {
    this.emit('contentCreated', event);
  }
  onContentCreated(listener: Listener<polycentric.SignedEvent>) {
    this.on('contentCreated', listener);
  }
  offContentCreated(listener: Listener<polycentric.SignedEvent>) {
    this.off('contentCreated', listener);
  }

  // State events
  emitStateChanged(state: ClientState) {
    this.emit('stateChanged', state);
  }
  onStateChanged(listener: Listener<ClientState>) {
    this.on('stateChanged', listener);
  }
  offStateChanged(listener: Listener<ClientState>) {
    this.off('stateChanged', listener);
  }

  // Progress events
  emitProgress(step: InitializationStep) {
    this.emit('progress', step);
  }
  onProgress(listener: Listener<InitializationStep>) {
    this.on('progress', listener);
  }
  offProgress(listener: Listener<InitializationStep>) {
    this.off('progress', listener);
  }

  // Error events
  emitError(error: Error) {
    this.emit('error', error);
  }
  onError(listener: Listener<Error>) {
    this.on('error', listener);
  }
  offError(listener: Listener<Error>) {
    this.off('error', listener);
  }

  // Utility methods
  removeAllListeners() {
    this.listeners.clear();
  }

  removeAllListenersForEvent<K extends keyof EventMap>(event: K) {
    this.listeners.delete(event);
  }
}

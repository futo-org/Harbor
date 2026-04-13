import EventEmitter from 'eventemitter3';
import type { KeyPair } from '../polycentric-client';
import type { SignedEvent } from '../proto/polycentric/v2/events';

export enum ClientState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  ERROR = 'error',
}

export enum InitializationStep {
  STARTING = 'Starting initialization...',
  INITIALIZING_CORE = 'Initializing core...',
  SETTING_UP_STORAGE = 'Setting up storage...',
  LOADING_PROCESS_ID = 'Loading process ID...',
  CREATING_PROCESS_ID = 'Creating process ID...',
  HYDRATING_EVENTS = 'Hydrating events...',
  CREATING_EPHEMERAL_IDENTITY = 'Creating ephemeral identity...',
  COMPLETE = 'Initialization complete.',
}

export enum HydrationStatus {
  NOT_STARTED = 'Not started',
  IN_PROGRESS = 'In progress',
  FAILED = 'Failed',
  COMPLETED = 'Completed',
}

// For type safety, this interface maps event names to their payload types
interface EventMap {
  identityChanged: KeyPair | null;
  contentCreated: SignedEvent;
  stateChanged: ClientState;
  hydrationStatus: HydrationStatus;
  progress: InitializationStep;
  error: Error;
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
  emitContentCreated(event: SignedEvent) {
    this.emit('contentCreated', event);
  }
  onContentCreated(listener: (event: SignedEvent) => void) {
    this.on('contentCreated', listener);
  }
  offContentCreated(listener: (event: SignedEvent) => void) {
    this.off('contentCreated', listener);
  }

  // State events
  emitStateChanged(state: ClientState) {
    this.emit('stateChanged', state);
  }
  onStateChanged(listener: (state: ClientState) => void) {
    this.on('stateChanged', listener);
  }
  offStateChanged(listener: (state: ClientState) => void) {
    this.off('stateChanged', listener);
  }

  // Progress events
  emitProgress(step: InitializationStep) {
    this.emit('progress', step);
  }
  onProgress(listener: (step: InitializationStep) => void) {
    this.on('progress', listener);
  }
  offProgress(listener: (step: InitializationStep) => void) {
    this.off('progress', listener);
  }

  // Hydration events
  emitHydrationStatus(status: HydrationStatus) {
    this.emit('hydrationStatus', status);
  }
  onHydrationStatus(listener: (status: HydrationStatus) => void) {
    this.on('hydrationStatus', listener);
  }
  offHydrationStatus(listener: (status: HydrationStatus) => void) {
    this.off('hydrationStatus', listener);
  }

  // Error events
  emitError(error: Error) {
    this.emit('error', error);
  }
  onError(listener: (error: Error) => void) {
    this.on('error', listener);
  }
  offError(listener: (error: Error) => void) {
    this.off('error', listener);
  }

  // Utility methods for cleanup
  public removeAllListeners() {
    this.emitter.removeAllListeners();
  }

  public removeAllListenersForEvent<K extends keyof EventMap>(event: K) {
    this.emitter.removeAllListeners(event);
  }
}

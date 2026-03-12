import * as FfiBridgeImpl from './ffi/bridge';
import type { ICryptoManager } from './crypto/crypto-manager';
export type FfiBridge = typeof FfiBridgeImpl;
import { polycentric } from './generated/protocol';
import { IdentityManager } from './client-internal/identity-manager';
import { SyncService } from './client-internal/sync-service';
import { QueryManager } from './client-internal/query-manager';
import { ContentManager } from './client-internal/content-manager';
import {
  EventService,
  ClientState,
  InitializationStep,
} from './client-internal/event-service';
import { Database } from './storage/database';
import { StorageHandle } from './storage/storage-handle';

export type KeyPair = {
  keyType: number;
  privateKey: polycentric.PrivateKey;
  publicKey: polycentric.PublicKey;
  processId?: polycentric.IProcess;
};

export type Identity = {
  keyPair: KeyPair;
  process: polycentric.IProcess;
};

export interface PolycentricClientConfig {
  cryptoManager: ICryptoManager;
  databaseName?: string;
}

export class PolycentricClient {
  readonly events = new EventService();
  readonly synchronization = new SyncService(this);

  readonly identityManager = new IdentityManager(this);
  readonly queryManager = new QueryManager(this);
  readonly contentManager = new ContentManager(this);

  private _state = ClientState.UNINITIALIZED;
  private _step: InitializationStep = InitializationStep.STARTING;
  private _error: Error | null = null;

  private readonly _ffiManager: FfiBridge;

  private _currentKeyPair: KeyPair | null = null;
  private _currentProcess: polycentric.IProcess | null = null;
  private _logicalClock = 1;

  private readonly _cryptoManager: ICryptoManager;
  private _storage: StorageHandle | null = null;
  private readonly _config: PolycentricClientConfig;

  private constructor(config: PolycentricClientConfig) {
    this._ffiManager = FfiBridgeImpl;
    this._cryptoManager = config.cryptoManager;
    this._config = config;
  }

  static async create(
    config: PolycentricClientConfig
  ): Promise<PolycentricClient> {
    const client = new PolycentricClient(config);
    await client.initialize();
    return client;
  }

  private async initialize(): Promise<void> {
    this.setState(ClientState.INITIALIZING);
    this.setStep(InitializationStep.STARTING);

    try {
      this.setStep(InitializationStep.INITIALIZING_FFI);
      if (!this.isInitialized()) {
        this._ffiManager.initialize();
      }

      if (this._config.databaseName) {
        this.setStep(InitializationStep.SETTING_UP_STORAGE);
        const database = new Database(this._config.databaseName);
        await database.open();
        this._storage = new StorageHandle(database);
        this._restoreIdentity();
        this.setStep(InitializationStep.HYDRATING_EVENTS);
        this._hydrate();
      }

      this.setStep(InitializationStep.COMPLETE);
      this.setState(ClientState.READY);
    } catch (err) {
      this.setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  private _restoreIdentity(): void {
    if (!this._storage) return;
    const allIdentities = this._storage.identities.getAll();
    if (allIdentities.length > 0) {
      const lastUsedKey = this._storage.currentIdentity.get();
      const restored = lastUsedKey
        ? allIdentities.find(
            (id) =>
              id.publicKey.key?.toString() === lastUsedKey.key?.toString()
          )
        : undefined;
      if (lastUsedKey && !restored) {
        this._storage.currentIdentity.clear();
      }
      const active = restored ?? allIdentities[0]!;
      this._currentKeyPair = active;
      if (active.processId) {
        this._currentProcess = active.processId;
      }
    }
    if (this._currentKeyPair && this._currentProcess && this._storage) {
      const processBytes =
        this._currentProcess.process ?? new Uint8Array();
      const currentClock =
        this._storage.processStates.getCurrentLogicalClock(
          this._currentKeyPair.keyType,
          this._currentKeyPair.publicKey.key,
          processBytes
        );
      this._logicalClock = currentClock > 0 ? currentClock + 1 : 1;
    }
  }

  private _hydrate(): void {
    if (!this._storage) return;
    const events = this._storage.events.getAllEvents();
    for (const event of events) {
      try {
        this._ffiManager.ingestEvent(event);
      } catch (e) {
        console.warn('Hydrate: skipping corrupted event', e);
      }
    }
  }

  get state(): ClientState {
    return this._state;
  }

  get step(): InitializationStep {
    return this._step;
  }

  get error(): Error | null {
    return this._error;
  }

  get storage(): StorageHandle | null {
    return this._storage;
  }

  get ffiBridge(): FfiBridge {
    return this._ffiManager;
  }

  get cryptoManager(): ICryptoManager {
    return this._cryptoManager;
  }

  get currentKeyPair(): KeyPair {
    if (!this._currentKeyPair) {
      throw new Error('Key pair not initialized');
    }
    return this._currentKeyPair;
  }

  get process(): polycentric.IProcess {
    if (!this._currentProcess) {
      throw new Error('Process not initialized');
    }
    return this._currentProcess;
  }

  get currentIdentity(): Identity {
    if (!this._currentKeyPair || !this._currentProcess) {
      throw new Error('Identity not initialized');
    }
    return {
      keyPair: this.currentKeyPair,
      process: this._currentProcess,
    };
  }

  nextLogicalClock(): number {
    if (this._storage && this._currentKeyPair && this._currentProcess) {
      const processBytes = this._currentProcess.process ?? new Uint8Array();
      const next = this._storage.processStates.getNextLogicalClock(
        this._currentKeyPair.keyType,
        this._currentKeyPair.publicKey.key,
        processBytes
      );
      this._storage.processStates.persistCurrentLogicalClock(
        this._currentKeyPair.keyType,
        this._currentKeyPair.publicKey.key,
        processBytes,
        next
      );
      return next;
    }

    const current = this._logicalClock;
    this._logicalClock += 1;
    return current;
  }

  get currentSystem(): polycentric.IPublicKey {
    return this.currentKeyPair.publicKey;
  }

  setCurrentKeyPair(keyPair: KeyPair): void {
    this._currentKeyPair = keyPair;
  }

  setCurrentProcess(process: polycentric.IProcess): void {
    this._currentProcess = process;
  }

  get logicalClock(): number {
    return this._logicalClock;
  }

  setLogicalClock(clock: number): void {
    this._logicalClock = clock;
  }

  isInitialized(): boolean {
    return this._ffiManager.isInitialized();
  }

  async createIdentity(defaultServer?: string): Promise<KeyPair> {
    const keyPair = await this.identityManager.createIdentity();
    if (defaultServer) {
      await this.addServer(defaultServer);
    }
    this.events.emitIdentityChanged(this.currentIdentity);
    return keyPair;
  }

  hasIdentity(): boolean {
    return this._currentKeyPair != null && this._currentProcess != null;
  }

  async switchIdentity(publicKey: polycentric.IPublicKey): Promise<KeyPair> {
    return this.identityManager.switchIdentity(publicKey);
  }

  getAllIdentities(): KeyPair[] {
    return this.identityManager.getAllIdentities();
  }

  async deleteIdentity(publicKey?: polycentric.IPublicKey): Promise<void> {
    if (!this._storage) return;

    const isCurrent =
      !publicKey ||
      (this._currentKeyPair &&
        this._currentKeyPair.publicKey.key?.toString() ===
          publicKey.key?.toString());

    if (isCurrent) {
      if (this._currentKeyPair) {
        this._storage.identities.remove(this._currentKeyPair.publicKey);
      }
      const remaining = this._storage.identities.getAll();
      if (remaining.length === 0) {
        this._storage.currentIdentity.clear();
        this._currentKeyPair = null;
        this._currentProcess = null;
        this._logicalClock = 1;
        this.events.emitIdentityChanged(null);
      } else {
        this._currentKeyPair = null;
        this._logicalClock = 1;
        await this.switchIdentity(remaining[0]!.publicKey);
      }
    } else {
      this._storage.identities.remove(publicKey!);
      if (this._currentKeyPair && this._currentProcess) {
        this.events.emitIdentityChanged({
          keyPair: this._currentKeyPair,
          process: this._currentProcess,
        });
      }
    }
  }

  async addServer(server: string): Promise<polycentric.SignedEvent> {
    return this.contentManager.createAddServer(server);
  }

  async sync(): Promise<{ errors: string[] }> {
    return this.synchronization.sync();
  }

  private setState(state: ClientState): void {
    this._state = state;
    this.events.emitStateChanged(state);
  }

  private setStep(step: InitializationStep): void {
    this._step = step;
    this.events.emitProgress(step);
  }

  private setError(error: Error): void {
    this._state = ClientState.ERROR;
    this._error = error;
    this.events.emitStateChanged(this._state);
    this.events.emitError(error);
  }
}

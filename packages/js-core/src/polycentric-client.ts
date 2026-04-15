import {
  ClientState,
  ContentManager,
  EventService,
  HydrationStatus,
  IdentityManager,
  KeyPairManager,
  InitializationStep,
} from './client-internal';
import { KEY_TYPE, COLLECTION, type Collection } from './constants';
import { HTTPClient } from './http';
import type {
  ICoreBridge,
  ICryptoManager,
  IPolycentricCore,
  IStorageDriver,
} from './platform-interfaces';
import * as Proto from './proto/v2';
import { StorageHandle } from './storage/storage-handle';

export type { IdentityState } from './client-internal/identity-manager';

/** Private key — same shape as PublicKey, holds the secret key bytes. */
export interface PrivateKey {
  keyType: Proto.KeyType;
  key: Uint8Array;
}

export interface KeyPair {
  keyType: Proto.KeyType;
  privateKey: PrivateKey;
  publicKey: Proto.PublicKey;
}

/**
 * PolycentricClientConfig defines the dependencies and configuration for a PolycentricClient.
 */
export interface PolycentricClientConfig {
  coreBridge: ICoreBridge;
  storageDriver: IStorageDriver;
  cryptoManager: ICryptoManager;
}

/**
 * PolycentricClient is the top level API for the Polycentric SDK.
 */
export class PolycentricClient {
  public readonly events = new EventService();

  public readonly keyPairManager = new KeyPairManager(this);
  public readonly contentManager = new ContentManager(this);
  public readonly identityManager = new IdentityManager(this);

  public readonly httpClient = new HTTPClient();

  private state = ClientState.UNINITIALIZED;
  public step = '';
  public hydrationStatus: HydrationStatus = HydrationStatus.NOT_STARTED;
  public error: Error | null = null;

  public core: IPolycentricCore | undefined;
  public readonly coreBridge: ICoreBridge;

  public currentKeyPair: KeyPair | null = null;
  /** The identity key the current key pair is actively using. Set by publishIdentity or claimIdentity. */
  public activeIdentityKey: string | null = null;
  public servers: string[] = ['http://localhost:50051'];

  public readonly cryptoManager: ICryptoManager;

  public storageHandle: StorageHandle | undefined;
  public readonly storageDriver: IStorageDriver;

  constructor(config: PolycentricClientConfig) {
    this.coreBridge = config.coreBridge;
    this.cryptoManager = config.cryptoManager;
    this.storageDriver = config.storageDriver;
  }

  public static async create(
    config: PolycentricClientConfig,
  ): Promise<PolycentricClient> {
    const client = new PolycentricClient(config);
    await client.initialize();
    return client;
  }

  private async initialize() {
    try {
      this.setState(ClientState.INITIALIZING);
      this.setStep(InitializationStep.STARTING);

      this.setStep(InitializationStep.INITIALIZING_CORE);
      if (this.coreBridge.initialized()) {
        this.core = this.coreBridge.getCoreInstance();
      } else {
        await this.coreBridge.initialize();
        this.core = this.coreBridge.getCoreInstance();
      }

      this.setStep(InitializationStep.SETTING_UP_STORAGE);
      this.storageHandle = new StorageHandle({
        eventRepository: this.storageDriver.createEventRepository(),
        contentRepository: this.storageDriver.createContentRepository(),
        keysRepository: this.storageDriver.createKeysRepository(),
        eventAckRepository: this.storageDriver.createEventAckRepository(),
      });

      this.setStep(InitializationStep.LOADING_PROCESS_ID);

      this.setStep(InitializationStep.HYDRATING_EVENTS);
      this.setHydrationStatus(HydrationStatus.COMPLETED);

      const restoredIdentity = await this.restoreKeyPair();

      // SDK should always make a new keypair if we can't find any
      if (!restoredIdentity) {
        this.setStep(InitializationStep.CREATING_EPHEMERAL_IDENTITY);
        await this.keyPairManager.createKeyPair({
          keyType: KEY_TYPE.ED25519,
          setAsCurrent: true,
        });
      }

      this.setStep(InitializationStep.COMPLETE);
      this.setState(ClientState.READY);
    } catch (error) {
      this.setError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Looks at existing keys and will pick the first one
   */
  private async restoreKeyPair(): Promise<boolean> {
    const identities = await this.keyPairManager.getKeys();
    const identity = identities[0];

    if (!identity) {
      return false;
    }

    this.setCurrentKeyPair(identity);
    return true;
  }

  /**
   * Helper function build an Event from a Content.
   * Uses the current keypair and current identity.
   */
  async buildEvent(
    content: Proto.Content,
    collection: Collection | number = COLLECTION.FEED,
  ): Promise<Proto.Event> {
    if (!this.currentKeyPair) {
      throw new Error('No keypair set');
    }

    if (!this.activeIdentityKey) {
      throw new Error('No active identity');
    }

    const sequence = await this.storage.events.getNextSequence(
      this.currentKeyPair.publicKey,
      collection,
      this.activeIdentityKey,
    );
    console.log('next seq', sequence.toString());

    // TODO: compute from head events via build_vector_clock
    const vectorClocks: Proto.VectorClock[] = [];

    const event = Proto.Event.create({
      key: Proto.EventKey.create({
        collection,
        identity: this.activeIdentityKey,
        signedBy: this.currentKeyPair.publicKey,
        sequence,
      }),
      vectorClocks,
      previousSignature: new Uint8Array(0),
      contentDigest: this.contentManager.buildDigest(content),
      createdAt: BigInt(Date.now()),
    });

    return event;
  }

  /**
   * Sign an event with the current key pair.
   */
  async signEvent(event: Proto.Event): Promise<Proto.SignedEvent> {
    const eventBytes = Proto.Event.toBinary(event);

    if (!this.core) {
      throw new Error('Can not sign event as core is not initialized');
    }

    const signedEventBytes = await this.core.sign_event(
      eventBytes,
      async (eventBytes) => {
        if (!this.currentKeyPair) {
          throw new Error('No keypair');
        }
        return await this.crypto.sign(
          this.currentKeyPair.privateKey.key,
          eventBytes,
          this.currentKeyPair.keyType,
        );
      },
    );

    return Proto.SignedEvent.fromBinary(signedEventBytes);
  }

  /**
   * Sign and persist a v2 Event.
   */
  async commitEvent(signedEvent: Proto.SignedEvent): Promise<void> {
    await this.storage.events.save(signedEvent);
    this.events.emitContentCreated(signedEvent);
  }

  /**
   * Build a vector clock
   */
  async buildVectorClock(event: Proto.Event): Promise<Proto.VectorClock[]> {
    if (!this.core) throw new Error('Core not initialized');

    const signerBytes = Proto.PublicKey.toBinary(event.key!.signedBy!);

    // Filter out any events that are from the same collection AND signing key as our new event
    const events = (
      await this.storage.events.getHeadsByIdentity(event.key!.identity)
    )
      .map((signedEvent) => Proto.Event.fromBinary(signedEvent.eventBytes))
      .filter(
        (e) =>
          !(
            e.key?.collection === event.key?.collection &&
            e.key?.signedBy?.key === event.key?.signedBy?.key
          ),
      )
      .map((e) => Proto.Event.toBinary(e));

    // Add our latest event to the heads array
    events.push(Proto.Event.toBinary(event));

    const vectorClockBytes = this.core.build_vector_clock(signerBytes, events);

    return vectorClockBytes.map((bytes) => Proto.VectorClock.fromBinary(bytes));
  }

  /**
   * Push local events for the active key to all configured servers,
   * including content alongside each event.
   */
  async push(): Promise<void> {
    if (!this.core) throw new Error('Core not initialized');
    if (!this.currentKeyPair) throw new Error('No active key pair');

    const localEvents = await this.storage.events.getAll();
    const publicKey = this.currentKeyPair.publicKey.key;

    // Build event bundles with content for events matching the active key
    const bundles: Proto.EventBundle[] = [];
    for (const signedEvent of localEvents) {
      const event = Proto.Event.fromBinary(signedEvent.eventBytes);

      // Only push events signed by the active key
      const signedBy = event.key?.signedBy;
      if (!signedBy || !this.bytesEqual(signedBy.key, publicKey)) continue;

      // Look up content by digest
      let serializedContent: Proto.SerializedContent | undefined;
      if (event.contentDigest?.value) {
        const content = await this.storage.content.get(event.contentDigest);

        const contentBytes = content ? Proto.Content.toBinary(content) : null;
        if (contentBytes) {
          serializedContent = Proto.SerializedContent.create({
            contentBytes,
          });
        }
      }

      bundles.push(
        Proto.EventBundle.create({
          signedEvent,
          serializedContent,
        }),
      );
    }

    if (bundles.length === 0) return;

    const requestBytes = Proto.PutEventsRequest.toBinary(
      Proto.PutEventsRequest.create({ eventBundles: bundles }),
    );

    const results = await Promise.allSettled(
      this.servers.map((server) => this.core!.put_events(server, requestBytes)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Push failed for a server:', result.reason);
      }
    }
  }

  /**
   * Pull signed events from all configured servers and persist new ones locally.
   *
   * @returns The number of new events persisted
   */
  async pull(): Promise<number> {
    if (!this.core) throw new Error('Core not initialized');

    let newCount = 0;

    const results = await Promise.allSettled(
      this.servers.map((server) => this.core!.list_events(server, null)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Pull failed for a server:', result.reason);
        continue;
      }

      const response = Proto.ListEventsResponse.fromBinary(result.value);

      for (const bundle of response.eventBundles) {
        if (!bundle.signedEvent) continue;

        // Always store content if included (even if event is a duplicate)
        if (bundle.serializedContent?.contentBytes) {
          try {
            const event = Proto.Event.fromBinary(bundle.signedEvent.eventBytes);
            if (event.contentDigest?.value) {
              const content = Proto.Content.fromBinary(
                bundle.serializedContent.contentBytes,
              );
              await this.storage.content.save(event.contentDigest, content);
            }
          } catch {
            // content decode failed, skip
          }
        }

        try {
          // Currently we are storing all events (and above content).
          // We probably dont want to be do this and only storing what we OWN or FOLLOW
          await this.storage.events.save(bundle.signedEvent);
          newCount++;
        } catch {
          // duplicate event, skip
        }
      }
    }

    return newCount;
  }

  /**
   * Push local events then pull remote events from all configured servers.
   *
   * @returns The number of new events pulled
   */
  async sync(): Promise<number> {
    await this.push();
    return this.pull();
  }

  public setCurrentKeyPair(keyPair: KeyPair) {
    this.currentKeyPair = keyPair;
    // Restore saved identity key for this key pair
    this.activeIdentityKey = this.loadActiveIdentityKey();
  }

  /**
   * Explicitly set the active identity key and persist it.
   */
  public setActiveIdentityKey(identityKey: string | null) {
    this.activeIdentityKey = identityKey;
    this.saveActiveIdentityKey(identityKey);
  }

  private identityStorageKey(): string | null {
    if (!this.currentKeyPair) return null;
    return `polycentric:activeIdentity:${this.toHex(this.currentKeyPair.publicKey.key, 32)}`;
  }

  private saveActiveIdentityKey(identityKey: string | null) {
    const key = this.identityStorageKey();
    if (!key) return;
    try {
      if (identityKey) {
        localStorage.setItem(key, identityKey);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // localStorage unavailable (SSR, etc.)
    }
  }

  private loadActiveIdentityKey(): string | null {
    const key = this.identityStorageKey();
    if (!key) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private setState(state: ClientState) {
    this.state = state;
    this.events.emitStateChanged(state);
  }

  private setStep(step: InitializationStep) {
    this.step = step;
    this.events.emitProgress(step);
  }

  private setHydrationStatus(status: HydrationStatus) {
    this.hydrationStatus = status;
    this.events.emitHydrationStatus(status);
  }

  private setError(error: Error) {
    this.state = ClientState.ERROR;
    this.error = error;
    this.events.emitStateChanged(this.state);
    this.events.emitError(error);
  }

  private bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private toHex(bytes: Uint8Array, len = 8): string {
    return Array.from(bytes.slice(0, len))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  get currentSystem(): Proto.PublicKey {
    return this.currentKeyPair!.publicKey;
  }

  get crypto(): ICryptoManager {
    if (!this.cryptoManager) {
      throw new Error('Crypto manager not initialized');
    }
    return this.cryptoManager;
  }

  get storage(): StorageHandle {
    if (!this.storageHandle) {
      throw new Error('Storage handle not initialized');
    }
    return this.storageHandle;
  }

  get isReady(): boolean {
    return this.state === ClientState.READY;
  }
}

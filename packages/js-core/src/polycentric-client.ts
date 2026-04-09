import {
  ClientState,
  ContentManager,
  EventService,
  HydrationStatus,
  KeyPairManager,
  InitializationStep,
} from './client-internal';
import { KEY_TYPE, COLLECTION } from './constants';
import { HTTPClient } from './http';
import type {
  ICoreBridge,
  ICryptoManager,
  IPolycentricCore,
  IStorageDriver,
} from './platform-interfaces';
import {
  Content,
  ContentDigest,
  ContentDigestType,
  Event as V2Event,
  EventBundle,
  EventKey,
  Identity,
  KeyType,
  PublicKey,
  ListEventsResponse,
  PutEventsRequest,
  SerializedContent,
  SignedEvent,
} from './proto/v2';
import { sha256 } from '@noble/hashes/sha2';
import { StorageHandle } from './storage/storage-handle';

/** Private key — same shape as PublicKey, holds the secret key bytes. */
export interface PrivateKey {
  keyType: KeyType;
  key: Uint8Array;
}

/**
 * Resolved identity state from the latest Identity document.
 */
export interface IdentityState {
  /** The identity key (hex-encoded sha256 of the initial Identity content) */
  identityKey: string | null;
  /** Rotation keys that control the identity */
  rotationKeys: PublicKey[];
  /** Signing keys authorized to sign events */
  signingKeys: PublicKey[];
}

export interface KeyPair {
  keyType: KeyType;
  privateKey: PrivateKey;
  publicKey: PublicKey;
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

  public readonly httpClient = new HTTPClient();

  private state = ClientState.UNINITIALIZED;
  public step = '';
  public hydrationStatus: HydrationStatus = HydrationStatus.NOT_STARTED;
  public error: Error | null = null;

  public core: IPolycentricCore | undefined;
  public readonly coreBridge: ICoreBridge;

  public currentKeyPair: KeyPair | null = null;
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
        processIdRepository: this.storageDriver.createProcessIdRepository(),
      });

      this.setStep(InitializationStep.LOADING_PROCESS_ID);

      this.setStep(InitializationStep.HYDRATING_EVENTS);
      this.setHydrationStatus(HydrationStatus.COMPLETED);

      const restoredIdentity = await this.restoreKeyPair();

      // SDK should always make a new keypair if we can't find any
      if (!restoredIdentity) {
        this.setStep(InitializationStep.CREATING_EPHEMERAL_IDENTITY);
        await this.createKeyPair({
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
    const identities = await this.getKeys();
    const identity = identities[0];

    if (!identity) {
      return false;
    }

    this.setCurrentKeyPair(identity);
    return true;
  }

  /**
   * Creates a new KeyPair.
   */
  async createKeyPair(options: { keyType?: KeyType; setAsCurrent?: boolean } = {}): Promise<KeyPair> {
    return this.keyPairManager.createKeyPair({
      keyType: options.keyType ?? KEY_TYPE.ED25519,
      setAsCurrent: options.setAsCurrent,
    });
  }

  /**
   * Gets all stored identities.
   */
  async getKeys(): Promise<KeyPair[]> {
    return this.keyPairManager.getKeys();
  }

  /**
   * Rotates the current key pair: generates a new one and removes the old one.
   *
   * @returns The new key pair
   */
  async rotateKeyPair(): Promise<KeyPair> {
    const oldPublicKey = this.currentKeyPair?.publicKey;

    const newKeyPair = await this.createKeyPair({
      keyType: KEY_TYPE.ED25519,
      setAsCurrent: true,
    });

    if (oldPublicKey) {
      await this.keyPairManager.removeKeyPair(oldPublicKey);
    }

    return newKeyPair;
  }

  /**
   * Switches to a new key pair.
   */
  async switchKeyPair(publicKey: PublicKey): Promise<KeyPair> {
    return this.keyPairManager.switchKeyPair(publicKey);
  }

  /**
   * Signs, verifies, and persists a v2 Event.
   *
   * @param eventBytes - Serialized v2 Event protobuf bytes
   * @returns The resulting signed event.
   */
  async createEvent(eventBytes: Uint8Array): Promise<SignedEvent> {
    return this.contentManager.createEvent(eventBytes);
  }

  /**
   * Creates a post event with the given text content.
   *
   * @param identityKey - The identity key (hex sha256 of initial Identity)
   * @param text - The text content of the post
   * @returns The resulting signed event
   */
  async createPost(identityKey: string, text: string): Promise<SignedEvent> {
    if (!this.currentKeyPair) {
      throw new Error('No keypair set');
    }

    const content = Content.create({
      contentBody: { oneofKind: 'post', post: { text, reply: undefined } },
    });
    const contentBytes = Content.toBinary(content);
    const contentHash = sha256(contentBytes);

    const sequence = await this.storage.events.getNextSequence(
      this.currentKeyPair.publicKey.key,
      identityKey,
    );

    const event = V2Event.create({
      key: EventKey.create({
        collection: COLLECTION.FEED,
        identity: identityKey,
        signedBy: {
          keyType: this.currentKeyPair.keyType,
          key: this.currentKeyPair.publicKey.key,
        },
        sequence,
      }),
      previousSignature: new Uint8Array(0),
      contentDigest: ContentDigest.create({
        type: ContentDigestType.SHA256,
        value: contentHash,
      }),
      createdAt: BigInt(Date.now()),
    });

    await this.storage.content.putContent(contentHash, contentBytes);
    return this.createEvent(V2Event.toBinary(event));
  }

  public async ingestEvent(signedEvent: SignedEvent): Promise<void> {
    await this.storage.events.persistEvent(signedEvent);
  }

  /**
   * Resolves the current identity state by finding the latest Identity
   * document on the identity collection for the active key pair.
   *
   * @returns The resolved identity state with rotation_keys and signing_keys
   */
  async getCurrentIdentity(): Promise<IdentityState> {
    const state: IdentityState = { identityKey: null, rotationKeys: [], signingKeys: [] };

    if (!this.currentKeyPair) return state;

    const allEvents = await this.storage.events.getAllEvents();
    const publicKey = this.currentKeyPair.publicKey.key;

    // Find identity events signed by the current key
    for (const signedEvent of allEvents) {
      const event = V2Event.fromBinary(signedEvent.eventBytes);

      // Only look at events signed by the current key in the identity collection
      if (event.key?.collection !== COLLECTION.IDENTITY) continue;
      if (!event.key.signedBy?.key || !this.bytesEqual(event.key.signedBy.key, publicKey)) continue;
      if (!event.contentDigest?.value) continue;

      const contentBytes = await this.storage.content.getContent(
        event.contentDigest.value,
      );
      if (!contentBytes) continue;

      const content = Content.fromBinary(contentBytes);

      if (content.contentBody.oneofKind === 'identity') {
        const identity = content.contentBody.identity;
        state.identityKey = event.key.identity;
        state.rotationKeys = [...identity.rotationKeys];
        state.signingKeys = [...identity.signingKeys];
      }
    }

    return state;
  }

  /**
   * Publishes a new Identity document with the given rotation and signing keys.
   *
   * The identity key is the hex-encoded sha256 of the initial Identity content.
   * For a new identity, pass null for identityKey and it will be computed.
   *
   * @param identityKey - Existing identity key, or null to create a new identity
   * @param rotationKeys - Keys that control the identity
   * @param signingKeys - Keys authorized to sign events
   * @returns The identity key and signed event
   */
  async publishIdentity(
    identityKey: string | null,
    rotationKeys: PublicKey[],
    signingKeys: PublicKey[],
  ): Promise<{ identityKey: string; signedEvent: SignedEvent }> {
    if (!this.currentKeyPair) {
      throw new Error('No active key pair');
    }

    const publicKeyBytes = this.currentKeyPair.publicKey.key;

    const identity = Identity.create({ rotationKeys, signingKeys });
    const content = Content.create({
      contentBody: { oneofKind: 'identity', identity },
    });
    const contentBytes = Content.toBinary(content);
    const contentHash = sha256(contentBytes);

    // If no identity key provided, compute from initial Identity content
    if (!identityKey) {
      const identityBytes = Identity.toBinary(identity);
      identityKey = this.toHex(sha256(identityBytes), 32);
    }

    const sequence = await this.storage.events.getNextSequence(
      publicKeyBytes,
      identityKey,
    );

    const event = V2Event.create({
      key: EventKey.create({
        collection: COLLECTION.IDENTITY,
        identity: identityKey,
        signedBy: {
          keyType: this.currentKeyPair.keyType,
          key: publicKeyBytes,
        },
        sequence,
      }),
      previousSignature: new Uint8Array(0),
      contentDigest: ContentDigest.create({
        type: ContentDigestType.SHA256,
        value: contentHash,
      }),
      createdAt: BigInt(Date.now()),
    });

    await this.storage.content.putContent(contentHash, contentBytes);
    const signedEvent = await this.createEvent(V2Event.toBinary(event));

    return { identityKey, signedEvent };
  }

  /**
   * Push local events for the active key to all configured servers,
   * including content alongside each event.
   */
  async push(): Promise<void> {
    if (!this.core) throw new Error('Core not initialized');
    if (!this.currentKeyPair) throw new Error('No active key pair');

    const localEvents = await this.storage.events.getAllEvents();
    const publicKey = this.currentKeyPair.publicKey.key;

    // Build event bundles with content for events matching the active key
    const bundles: EventBundle[] = [];
    for (const signedEvent of localEvents) {
      const event = V2Event.fromBinary(signedEvent.eventBytes);

      // Only push events signed by the active key
      const signedBy = event.key?.signedBy;
      if (!signedBy || !this.bytesEqual(signedBy.key, publicKey)) continue;

      // Look up content by digest
      let serializedContent: SerializedContent | undefined;
      if (event.contentDigest?.value) {
        const contentBytes = await this.storage.content.getContent(
          event.contentDigest.value,
        );
        if (contentBytes) {
          serializedContent = SerializedContent.create({
            contentBytes,
          });
        }
      }

      bundles.push(
        EventBundle.create({
          signedEvent,
          serializedContent,
        }),
      );
    }

    if (bundles.length === 0) return;

    const requestBytes = PutEventsRequest.toBinary(
      PutEventsRequest.create({ eventBundles: bundles }),
    );

    const results = await Promise.allSettled(
      this.servers.map((server) =>
        this.core!.put_events(server, requestBytes),
      ),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Push failed for a server:', result.reason);
      }
    }
  }

  /**
   * Pull verified events from all configured servers and persist new ones locally.
   *
   * @returns The number of new events persisted
   */
  async pull(): Promise<number> {
    if (!this.core) throw new Error('Core not initialized');

    let newCount = 0;

    const results = await Promise.allSettled(
      this.servers.map((server) => this.core!.list_events(server)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Pull failed for a server:', result.reason);
        continue;
      }

      const response = ListEventsResponse.fromBinary(result.value);

      for (const bundle of response.eventBundles) {
        if (!bundle.signedEvent) continue;

        // Always store content if included (even if event is a duplicate)
        if (bundle.serializedContent?.contentBytes) {
          try {
            const event = V2Event.fromBinary(bundle.signedEvent.eventBytes);
            if (event.contentDigest?.value) {
              await this.storage.content.putContent(
                event.contentDigest.value,
                bundle.serializedContent.contentBytes,
              );
            }
          } catch {
            // content decode failed, skip
          }
        }

        try {
          await this.storage.events.persistEvent(bundle.signedEvent);
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

  get currentSystem(): PublicKey {
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

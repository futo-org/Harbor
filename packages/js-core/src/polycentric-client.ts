import {
  ClientState,
  ContentManager,
  EventService,
  HydrationStatus,
  KeyPairManager,
  InitializationStep,
} from './client-internal';
import { KEY_TYPE, STREAM_ID } from './constants';
import { HTTPClient } from './http';
import type {
  ICoreBridge,
  ICryptoManager,
  IPolycentricCore,
  IStorageDriver,
} from './platform-interfaces';
import { PrivateKey, PublicKey } from './proto/polycentric';
import {
  Content,
  ContentDigest,
  ContentDigestType,
  Event as V2Event,
  EventKey,
  SignedEvent,
} from './proto/v2';
import { sha256 } from '@noble/hashes/sha2';
import { StorageHandle } from './storage/storage-handle';

export interface KeyPair {
  keyType: bigint;
  privateKey: PrivateKey;
  publicKey: PublicKey;
}

export interface Identity {
  keyPair: KeyPair;
}

export interface IdentityOptions {
  keyType?: bigint;
  setAsCurrent?: boolean;
  ephemeral?: boolean;
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
   * Creates a new KeyPair for the current process.
   */
  async createKeyPair(options: IdentityOptions = {}): Promise<KeyPair> {
    return this.keyPairManager.createKeyPair({
      keyType: options.keyType ?? KEY_TYPE.ED25519,
      setAsCurrent: options.setAsCurrent,
      ephemeral: options.ephemeral,
    });
  }

  /**
   * Imports and stores an existing identity using its private key.
   */
  async importIdentity(
    privateKey: PrivateKey,
    setAsCurrent: boolean = true,
  ): Promise<KeyPair> {
    return this.keyPairManager.importIdentity(privateKey, setAsCurrent);
  }

  /**
   * Gets all stored identities.
   */
  async getKeys(): Promise<KeyPair[]> {
    return this.keyPairManager.getKeys();
  }

  /**
   * Removes an identity from storage.
   */
  async removeKeyPair(publicKey: PublicKey) {
    await this.keyPairManager.removeIdentity(publicKey);
  }

  async deleteKeyPair(publicKey?: PublicKey): Promise<void> {
    const isCurrent =
      !publicKey ||
      (this.currentKeyPair &&
        this.currentKeyPair.publicKey.key?.toString() ===
          publicKey.key?.toString());

    if (isCurrent) {
      const currentPublicKey = this.currentKeyPair?.publicKey;

      if (currentPublicKey) await this.removeKeyPair(currentPublicKey);

      const remaining = await this.getKeys();
      if (remaining.length > 0) {
        await this.switchKeyPair(remaining[0]!.publicKey);
        return;
      }

      await this.createKeyPair({
        keyType: KEY_TYPE.ED25519,
        setAsCurrent: true,
        ephemeral: true,
      });
    } else {
      await this.removeKeyPair(publicKey!);
    }
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
   * @param text - The text content of the post
   * @returns The resulting signed event
   */
  async createPost(text: string): Promise<SignedEvent> {
    if (!this.currentKeyPair) {
      throw new Error('No keypair set');
    }

    const streamId = STREAM_ID.FEED;

    const content = Content.create({
      contentBody: { oneofKind: 'post', post: { text, reply: undefined } },
    });
    const contentBytes = Content.toBinary(content);
    const contentHash = sha256(contentBytes);

    const sequence = await this.storage.events.getNextSequence(
      this.currentKeyPair.publicKey.key,
      streamId,
    );

    const event = V2Event.create({
      key: EventKey.create({
        streamId,
        signedBy: {
          keyType: Number(this.currentKeyPair.keyType),
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

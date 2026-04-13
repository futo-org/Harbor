import {
  ClientState,
  ContentManager,
  EventService,
  HydrationStatus,
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
import { sha256 } from '@noble/hashes/sha2';
import { StorageHandle } from './storage/storage-handle';

/** Private key — same shape as PublicKey, holds the secret key bytes. */
export interface PrivateKey {
  keyType: Proto.KeyType;
  key: Uint8Array;
}

/**
 * Resolved identity state from the latest Identity document.
 */
export interface IdentityState {
  /** The identity key (hex-encoded sha256 of the initial Identity content) */
  identityKey: string | null;
  /** Rotation keys that control the identity */
  rotationKeys: Proto.PublicKey[];
  /** Signing keys authorized to sign events */
  signingKeys: Proto.PublicKey[];
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
  async createKeyPair(
    options: { keyType?: Proto.KeyType; setAsCurrent?: boolean } = {},
  ): Promise<KeyPair> {
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
  async switchKeyPair(publicKey: Proto.PublicKey): Promise<KeyPair> {
    return this.keyPairManager.switchKeyPair(publicKey);
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

    const vectorClocks = {
      [COLLECTION.IDENTITY]: Proto.VectorClock.create({
        sequence: [BigInt(1)],
      }),
      [COLLECTION.FEED]: Proto.VectorClock.create(),
    };

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
   * Ingest a signed event, verifying that the signer is authorized for the
   * identity claimed in the EventKey before persisting.
   */
  public async ingestEvent(signedEvent: Proto.SignedEvent): Promise<void> {
    const event = Proto.Event.fromBinary(signedEvent.eventBytes);
    const identityKey = event.key?.identity;
    const signerKey = event.key?.signedBy?.key;

    if (identityKey && signerKey) {
      const authorized = await this.isKeyAuthorizedForIdentity(
        identityKey,
        signerKey,
        event.createdAt,
      );
      if (!authorized) {
        throw new Error(
          `Signer ${this.toHex(signerKey)} is not authorized for identity ${identityKey.slice(0, 16)}...`,
        );
      }
    }

    await this.storage.events.save(signedEvent);
  }

  /**
   * Check whether a public key was authorized (as rotation or signing key)
   * for a given identity at a specific time. Returns true if the identity is
   * not found locally (caller may not have pulled the identity yet).
   */
  private async isKeyAuthorizedForIdentity(
    identityKey: string,
    signerKey: Uint8Array,
    atTime?: bigint,
  ): Promise<boolean> {
    const allEvents = await this.storage.events.getAll();

    // Build timeline of identity versions sorted by createdAt
    const versions: {
      createdAt: bigint;
      rotationKeys: Proto.PublicKey[];
      signingKeys: Proto.PublicKey[];
    }[] = [];

    for (const se of allEvents) {
      const ev = Proto.Event.fromBinary(se.eventBytes);
      if (ev.key?.collection !== COLLECTION.IDENTITY) continue;
      if (ev.key.identity !== identityKey) continue;
      if (!ev.contentDigest?.value) continue;

      const cb = await this.storage.content.get(ev.contentDigest.value);
      if (!cb) continue;

      const c = Proto.Content.fromBinary(cb);
      if (c.contentBody.oneofKind === 'identity') {
        versions.push({
          createdAt: ev.createdAt,
          rotationKeys: [...c.contentBody.identity.rotationKeys],
          signingKeys: [...c.contentBody.identity.signingKeys],
        });
      }
    }

    if (versions.length === 0) return true; // identity not found locally

    versions.sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );

    // Find the identity version active at the given time (or latest if no time)
    let active = versions[versions.length - 1];
    if (atTime !== undefined) {
      active = versions[0]; // fallback to first
      for (const v of versions) {
        if (v.createdAt <= atTime) active = v;
        else break;
      }
    }

    return (
      active.rotationKeys.some((k) => this.bytesEqual(k.key, signerKey)) ||
      active.signingKeys.some((k) => this.bytesEqual(k.key, signerKey))
    );
  }

  /**
   * Resolves the current identity state by finding the latest Identity
   * document on the identity collection for the active key pair.
   *
   * @returns The resolved identity state with rotation_keys and signing_keys
   */
  async getCurrentIdentity(): Promise<IdentityState> {
    const state: IdentityState = {
      identityKey: null,
      rotationKeys: [],
      signingKeys: [],
    };

    if (!this.activeIdentityKey) return state;

    // TODO: Fix this so it doesn't need to go over all events
    const allEvents = await this.storage.events.getAll();

    // Find the latest identity event matching the active identity key
    for (const signedEvent of allEvents) {
      const event = Proto.Event.fromBinary(signedEvent.eventBytes);

      if (event.key?.collection !== COLLECTION.IDENTITY) continue;
      if (event.key.identity !== this.activeIdentityKey) continue;
      if (!event.contentDigest?.value) continue;

      const content = await this.storage.content.get(event.contentDigest);
      if (!content) continue;

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
    rotationKeys: Proto.PublicKey[],
    signingKeys: Proto.PublicKey[],
  ): Promise<{ identityKey: string; signedEvent: Proto.SignedEvent }> {
    if (!this.currentKeyPair) {
      throw new Error('No active key pair');
    }

    const identity = Proto.Identity.create({ rotationKeys, signingKeys });
    const content = Proto.Content.create({
      contentBody: { oneofKind: 'identity', identity },
    });
    const contentBytes = Proto.Content.toBinary(content);
    const contentHash = sha256(contentBytes);

    // If no identity key provided, compute from initial Identity content
    if (!identityKey) {
      const identityBytes = Proto.Identity.toBinary(identity);
      identityKey = this.toHex(sha256(identityBytes), 32);
    }

    const sequence = await this.storage.events.getNextSequence(
      this.currentKeyPair.publicKey,
      COLLECTION.IDENTITY,
      identityKey,
    );

    const event = Proto.Event.create({
      key: Proto.EventKey.create({
        collection: COLLECTION.IDENTITY,
        identity: identityKey,
        signedBy: this.currentKeyPair.publicKey,
        sequence,
      }),
      previousSignature: new Uint8Array(0),
      contentDigest: Proto.ContentDigest.create({
        type: Proto.ContentDigestType.SHA256,
        value: contentHash,
      }),
      createdAt: BigInt(Date.now()),
    });

    await this.storage.content.save(contentHash, contentBytes);
    const signedEvent = await this.signEvent(event);
    await this.commitEvent(signedEvent);

    this.setActiveIdentityKey(identityKey);

    return { identityKey, signedEvent };
  }

  /**
   * Adds a signing key to the current identity and publishes the updated document.
   *
   * @param identityKey - The identity key to update
   * @param publicKey - The public key to add as a signing key
   * @returns The signed event
   */
  async addSigningKey(
    identityKey: string,
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = await this.getCurrentIdentity();
    if (state.identityKey !== identityKey) {
      throw new Error('Identity key mismatch');
    }

    const signingKeys = [...state.signingKeys, publicKey];
    const { signedEvent } = await this.publishIdentity(
      identityKey,
      state.rotationKeys,
      signingKeys,
    );
    return signedEvent;
  }

  /**
   * Removes a signing key from the current identity and publishes the updated document.
   *
   * @param identityKey - The identity key to update
   * @param publicKey - The public key to remove from signing keys
   * @returns The signed event
   */
  async removeSigningKey(
    identityKey: string,
    publicKey: Proto.PublicKey,
  ): Promise<Proto.SignedEvent> {
    const state = await this.getCurrentIdentity();
    if (state.identityKey !== identityKey) {
      throw new Error('Identity key mismatch');
    }

    const signingKeys = state.signingKeys.filter(
      (k) => !this.bytesEqual(k.key, publicKey.key),
    );
    const { signedEvent } = await this.publishIdentity(
      identityKey,
      state.rotationKeys,
      signingKeys,
    );
    return signedEvent;
  }

  /**
   * Claims an identity by pulling its latest Identity document from the server
   * and storing it locally. Verifies the current key is listed in the identity's
   * rotation_keys or signing_keys.
   *
   * @param identityKey - The identity key to claim
   * @returns The resolved identity state
   */
  async claimIdentity(identityKey: string): Promise<IdentityState> {
    if (!this.core) throw new Error('Core not initialized');
    if (!this.currentKeyPair) throw new Error('No active key pair');

    const publicKey = this.currentKeyPair.publicKey.key;

    // Pull identity events from all servers
    for (const server of this.servers) {
      try {
        const responseBytes = await this.core.list_events(
          server,
          null,
          identityKey,
          COLLECTION.IDENTITY,
        );
        const response = Proto.ListEventsResponse.fromBinary(responseBytes);

        for (const bundle of response.eventBundles) {
          if (!bundle.signedEvent) continue;

          // Store content
          if (bundle.serializedContent?.contentBytes) {
            const event = Proto.Event.fromBinary(bundle.signedEvent.eventBytes);
            if (event.contentDigest?.value) {
              await this.storage.content.save(
                event.contentDigest.value,
                bundle.serializedContent.contentBytes,
              );
            }
          }

          // Store event
          try {
            await this.storage.events.save(bundle.signedEvent);
          } catch {
            // duplicate, skip
          }
        }
      } catch {
        // server unreachable, try next
      }
    }

    // Find the identity document among pulled events and verify authorization
    const allEvents = await this.storage.events.getAll();
    let foundState: IdentityState | null = null;

    for (const se of allEvents) {
      const ev = Proto.Event.fromBinary(se.eventBytes);
      if (ev.key?.collection !== COLLECTION.IDENTITY) continue;
      if (ev.key.identity !== identityKey) continue;
      if (!ev.contentDigest?.value) continue;

      const cb = await this.storage.content.get(ev.contentDigest.value);
      if (!cb) continue;

      const c = Proto.Content.fromBinary(cb);
      if (c.contentBody.oneofKind === 'identity') {
        foundState = {
          identityKey,
          rotationKeys: [...c.contentBody.identity.rotationKeys],
          signingKeys: [...c.contentBody.identity.signingKeys],
        };
      }
    }

    if (!foundState) {
      throw new Error(`Identity ${identityKey} not found on any server`);
    }

    const isAuthorized =
      foundState.rotationKeys.some((k) => this.bytesEqual(k.key, publicKey)) ||
      foundState.signingKeys.some((k) => this.bytesEqual(k.key, publicKey));

    if (!isAuthorized) {
      throw new Error('Current key is not authorized for this identity');
    }

    this.setActiveIdentityKey(identityKey);

    return foundState;
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
      this.servers.map((server) => this.core!.list_events(server)),
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

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
import { PublicKey } from './proto/polycentric';
import type { PrivateKey } from './proto/polycentric';
import {
  Content,
  ContentDigest,
  ContentDigestType,
  Event as V2Event,
  EventKey,
  Identity as V2Identity,
  IdentityId,
  IdentityIssue,
  IdentityPermission,
  ListEventsResponse,
  SignedEvent,
} from './proto/v2';
import { sha256 } from '@noble/hashes/sha2';
import { StorageHandle } from './storage/storage-handle';

/**
 * A single step in the identity event replay log.
 */
export interface IdentityEvent {
  sequence: bigint;
  createdAt: bigint;
  type: 'identity' | 'issue' | 'revoke' | 'unknown';
  signatureValid: boolean;
  detail: string;
}

/**
 * Resolved identity state from replaying all events on the identity stream.
 */
export interface IdentityState {
  /** The self-signed identity, or null if none created */
  identity: V2Identity | null;
  /** Public keys that have been issued permissions (and not revoked) */
  authorizedKeys: Array<{ keyType: number; key: Uint8Array; permissions: IdentityPermission[] }>;
  /** Full ordered log of identity events for auditability */
  eventLog: IdentityEvent[];
}

export interface KeyPair {
  keyType: bigint;
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
  async createKeyPair(options: { keyType?: bigint; setAsCurrent?: boolean } = {}): Promise<KeyPair> {
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

  /**
   * Resolves the current identity state for the active key pair by replaying
   * all events on the 'identity' stream in sequence order.
   *
   * - `Identity` events establish the identity
   * - `IdentityIssue` events add authorized keys
   * - `IdentityRevoke` events remove authorized keys
   *
   * @returns The resolved identity state
   */
  async getCurrentIdentity(): Promise<IdentityState> {
    const state: IdentityState = { identity: null, authorizedKeys: [], eventLog: [] };

    if (!this.currentKeyPair) return state;

    const events = await this.storage.events.getEventsByStream(
      this.currentKeyPair.publicKey.key,
      STREAM_ID.IDENTITY,
    );

    for (const signedEvent of events) {
      const event = V2Event.fromBinary(signedEvent.eventBytes);
      const sequence = event.key?.sequence ?? 0n;
      const createdAt = event.createdAt;

      // Verify signature
      let signatureValid = false;
      if (this.core) {
        try {
          this.core.verify_signed_event(SignedEvent.toBinary(signedEvent));
          signatureValid = true;
        } catch {
          // invalid
        }
      }

      if (!event.contentDigest?.value) {
        state.eventLog.push({
          sequence, createdAt, signatureValid,
          type: 'unknown',
          detail: 'Missing content digest',
        });
        continue;
      }

      const contentBytes = await this.storage.content.getContent(
        event.contentDigest.value,
      );
      if (!contentBytes) {
        state.eventLog.push({
          sequence, createdAt, signatureValid,
          type: 'unknown',
          detail: 'Content not found locally',
        });
        continue;
      }

      const content = Content.fromBinary(contentBytes);

      switch (content.contentBody.oneofKind) {
        case 'identity': {
          state.identity = content.contentBody.identity;
          const idHex = content.contentBody.identity.id?.value
            ? this.toHex(content.contentBody.identity.id.value, 12)
            : '?';
          state.eventLog.push({
            sequence, createdAt, signatureValid,
            type: 'identity',
            detail: `Created identity ${idHex}...`,
          });
          break;
        }

        case 'identityIssue': {
          const issue = content.contentBody.identityIssue;
          if (issue.publicKey) {
            state.authorizedKeys = state.authorizedKeys.filter(
              (k) => !this.bytesEqual(k.key, issue.publicKey!.key),
            );
            state.authorizedKeys.push({
              keyType: issue.publicKey.keyType,
              key: issue.publicKey.key,
              permissions: [...issue.permissions],
            });
          }
          const keyHex = issue.publicKey?.key
            ? this.toHex(issue.publicKey.key)
            : '?';
          const perms = issue.permissions.join(', ');
          state.eventLog.push({
            sequence, createdAt, signatureValid,
            type: 'issue',
            detail: `Issued key ${keyHex}... with permissions [${perms}]`,
          });
          break;
        }

        case 'identityRevoke': {
          const revoke = content.contentBody.identityRevoke;
          if (revoke.publicKey) {
            state.authorizedKeys = state.authorizedKeys.filter(
              (k) => !this.bytesEqual(k.key, revoke.publicKey!.key),
            );
          }
          const keyHex = revoke.publicKey?.key
            ? this.toHex(revoke.publicKey.key)
            : '?';
          state.eventLog.push({
            sequence, createdAt, signatureValid,
            type: 'revoke',
            detail: `Revoked key ${keyHex}...`,
          });
          break;
        }

        default:
          state.eventLog.push({
            sequence, createdAt, signatureValid,
            type: 'unknown',
            detail: `Unknown content type: ${content.contentBody.oneofKind ?? 'none'}`,
          });
          break;
      }
    }

    return state;
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

  /**
   * Creates a new v2 Identity by self-signing the current public key.
   *
   * The IdentityId is the ed25519 signature of the public key bytes,
   * signed by the private key. This is published as an event on the
   * 'identity' stream.
   *
   * @returns The created Identity proto and the signed event
   */
  async createIdentity(): Promise<{ identity: V2Identity; signedEvent: SignedEvent }> {
    if (!this.currentKeyPair) {
      throw new Error('No active key pair');
    }

    const publicKeyBytes = this.currentKeyPair.publicKey.key;

    // Self-sign: sign the public key bytes to produce the IdentityId
    const idSignature = await this.crypto.sign(
      this.currentKeyPair.privateKey.key,
      publicKeyBytes,
      this.currentKeyPair.keyType,
    );

    const identity = V2Identity.create({
      id: IdentityId.create({ value: idSignature }),
      initialPublicKey: {
        keyType: Number(this.currentKeyPair.keyType),
        key: publicKeyBytes,
      },
    });

    const content = Content.create({
      contentBody: { oneofKind: 'identity', identity },
    });
    const contentBytes = Content.toBinary(content);
    const contentHash = sha256(contentBytes);

    const sequence = await this.storage.events.getNextSequence(
      publicKeyBytes,
      STREAM_ID.IDENTITY,
    );

    const event = V2Event.create({
      key: EventKey.create({
        streamId: STREAM_ID.IDENTITY,
        signedBy: {
          keyType: Number(this.currentKeyPair.keyType),
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

    return { identity, signedEvent };
  }

  /**
   * Issues an identity grant to another public key, giving it permissions
   * under the current identity.
   *
   * @param targetPublicKey - The public key bytes to grant permissions to
   * @param targetKeyType - The key type of the target key
   * @param permissions - The permissions to grant (defaults to ALL)
   * @returns The signed event
   */
  async issueIdentity(
    targetPublicKey: Uint8Array,
    targetKeyType: number = 1,
    permissions: IdentityPermission[] = [IdentityPermission.ALL],
  ): Promise<SignedEvent> {
    if (!this.currentKeyPair) {
      throw new Error('No active key pair');
    }

    const publicKeyBytes = this.currentKeyPair.publicKey.key;

    const issue = IdentityIssue.create({
      publicKey: { keyType: targetKeyType, key: targetPublicKey },
      permissions,
    });

    const content = Content.create({
      contentBody: { oneofKind: 'identityIssue', identityIssue: issue },
    });
    const contentBytes = Content.toBinary(content);
    const contentHash = sha256(contentBytes);

    const sequence = await this.storage.events.getNextSequence(
      publicKeyBytes,
      STREAM_ID.IDENTITY,
    );

    const event = V2Event.create({
      key: EventKey.create({
        streamId: STREAM_ID.IDENTITY,
        signedBy: {
          keyType: Number(this.currentKeyPair.keyType),
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
    return this.createEvent(V2Event.toBinary(event));
  }

  /**
   * Push local events for the active key to all configured servers.
   */
  async push(): Promise<void> {
    if (!this.core) throw new Error('Core not initialized');
    if (!this.currentKeyPair) throw new Error('No active key pair');

    const localEvents = await this.storage.events.getAllEvents();
    const localEventBytes = localEvents.map((e) => SignedEvent.toBinary(e));

    const results = await Promise.allSettled(
      this.servers.map((server) =>
        this.core!.push_events(
          server,
          this.currentKeyPair!.publicKey.key,
          localEventBytes,
        ),
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
      this.servers.map((server) => this.core!.pull_events(server)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Pull failed for a server:', result.reason);
        continue;
      }

      const response = ListEventsResponse.fromBinary(result.value);

      for (const bundle of response.eventBundles) {
        if (bundle.signedEvent) {
          try {
            await this.storage.events.persistEvent(bundle.signedEvent);
            newCount++;
          } catch {
            // duplicate, skip
          }
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

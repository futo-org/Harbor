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
import { bytesToHex } from './utils/hex';

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
  /**
   * gRPC-web URLs the client should start with. Used to seed
   * `client.servers` before `initialize()` fetches each server's
   * `ServerInfo`.
   */
  seedServers?: string[];
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
  public servers: string[] = ['http://localhost:3000'];

  /** CDN URL per server, populated by `fetchServerInfo` during init. */
  private cdnUrlByServer = new Map<string, string>();

  public readonly cryptoManager: ICryptoManager;

  public storageHandle: StorageHandle | undefined;
  public readonly storageDriver: IStorageDriver;

  constructor(config: PolycentricClientConfig) {
    this.coreBridge = config.coreBridge;
    this.cryptoManager = config.cryptoManager;
    this.storageDriver = config.storageDriver;
    if (config.seedServers && config.seedServers.length > 0) {
      this.servers = [...config.seedServers];
    }
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

      await this.copyEvents();
      await this.copyContents();

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

      // Resolve each server's CDN URL. Failures are tolerated — clients
      // still work without a CDN, they just can't fetch blob bodies.
      await this.fetchServerInfo();

      this.setStep(InitializationStep.COMPLETE);
      this.setState(ClientState.READY);
    } catch (error) {
      this.setError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Call `ServerService.GetInfo` on every configured server and cache
   * each server's `cdn_url`. Failures are logged, not thrown.
   */
  private async fetchServerInfo(): Promise<void> {
    if (!this.core) return;

    const results = await Promise.allSettled(
      this.servers.map(async (server) => {
        const bytes = await this.core!.get_server_info(server);
        const response = Proto.GetServerInfoResponse.fromBinary(bytes);
        return { server, info: response.serverInfo };
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('fetchServerInfo failed:', result.reason);
        continue;
      }
      const { server, info } = result.value;
      if (info?.cdnUrl) {
        this.cdnUrlByServer.set(server, info.cdnUrl);
      }
    }
  }

  /**
   * Return the CDN base URL for `server`, as reported by
   * `ServerService.GetInfo`. Returns `null` if info hasn't been
   * fetched yet or the server didn't report one.
   */
  cdnUrlFor(server: string): string | null {
    return this.cdnUrlByServer.get(server) ?? null;
  }

  /**
   * Build the HTTP URL for a blob by its content digest, using the
   * first server's reported CDN URL. Returns `null` when no CDN is
   * known.
   */
  blobUrl(digest: Proto.ContentDigest): string | null {
    const server = this.servers[0];
    if (!server) return null;
    const cdn = this.cdnUrlByServer.get(server);
    if (!cdn) return null;
    return `${cdn}/blob/${digest.type}_${bytesToHex(digest.value)}`;
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
   * Hydrate the Rust core's in-memory stores from persistent storage.
   * The Rust stores are ephemeral (reset on every load) so anything the
   * core needs (events for clocks/sequences, content for identity lookups)
   * must be copied in at startup.
   */
  async copyEvents() {
    if (!this.core) return;

    const signedEvents = await this.storage.events.getAll();

    this.core.copy_events(
      signedEvents.map((s) => Proto.SignedEvent.toBinary(s)),
    );
  }

  /**
   * A temporary function to copy all the content the browser is aware of.
   * We should make this smarter with the EventBundles, maybe.
   */
  async copyContents() {
    if (!this.core) return;
    const contents = await this.storage.content.getAll();

    const contentMap = new Map<Uint8Array, Uint8Array>();
    for (const r of contents) {
      contentMap.set(
        Proto.ContentDigest.toBinary(r.digest),
        Proto.Content.toBinary(r.content),
      );
    }
    this.core.copy_contents(contentMap);
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

    const sequence = this.core!.next_sequence(
      this.activeIdentityKey,
      collection,
      Proto.PublicKey.toBinary(this.currentKeyPair.publicKey),
    );

    const identitySequence =
      this.core!.next_sequence(
        this.activeIdentityKey,
        COLLECTION.IDENTITY,
        Proto.PublicKey.toBinary(this.currentKeyPair.publicKey),
      ) - 1n;

    const event = Proto.Event.create({
      key: Proto.EventKey.create({
        collection,
        identity: this.activeIdentityKey,
        signedBy: this.currentKeyPair.publicKey,
        sequence,
      }),
      identitySequence,
      previousSignature: new Uint8Array(0),
      contentDigest: this.contentManager.buildDigest(content),
      createdAt: BigInt(Date.now()),
    });

    event.vectorClock = this.buildVectorClock(event);

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
   *
   * Mirrors the event (and its content, if supplied) into the Rust core so
   * subsequent `build_vector_clock` / `next_sequence` calls see it.
   */
  async commitEvent(
    signedEvent: Proto.SignedEvent,
    content?: Proto.Content,
  ): Promise<void> {
    await this.storage.events.save(signedEvent);

    this.core!.copy_events([Proto.SignedEvent.toBinary(signedEvent)]);

    if (content) {
      const event = Proto.Event.fromBinary(signedEvent.eventBytes);
      if (event.contentDigest) {
        const contentMap = new Map<Uint8Array, Uint8Array>();
        contentMap.set(
          Proto.ContentDigest.toBinary(event.contentDigest),
          Proto.Content.toBinary(content),
        );
        this.core!.copy_contents(contentMap);
      }
    }

    this.events.emitContentCreated({ signedEvent, content });
  }

  /**
   * Build a vector clock for a single collection within an identity.
   *
   * Delegates to the Rust core, which resolves the referenced identity
   * document from its local content store and computes the clock.
   * Requires the identity event and its content to already have been
   * copied into the core via `copy_events` / `copy_contents`.
   */
  buildVectorClock(event: Proto.Event): Proto.VectorClock {
    if (!this.core) throw new Error('Core not initialized');
    const clockBytes = this.core.build_vector_clock(
      event.key!.identity,
      event.key!.collection,
      event.identitySequence,
      Proto.PublicKey.toBinary(event.key!.signedBy!),
      event.key!.sequence,
    );
    return Proto.VectorClock.fromBinary(clockBytes);
  }

  /**
   * Generic query wrapper around `core.list_events`. Fans the query out to
   * every configured server and returns the aggregated event bundles.
   * Does not persist — callers decide what to do with the response.
   */
  async listEvents(options?: {
    limit?: number | null;
    identity?: string | null;
    collection?: number | null;
    signedBy?: Proto.PublicKey | null;
    /** Exclusive lower bound on EventKey.sequence. */
    sequenceGt?: number | bigint | null;
    /** Exclusive upper bound on EventKey.sequence. */
    sequenceLt?: number | bigint | null;
  }): Promise<Proto.EventBundle[]> {
    if (!this.core) throw new Error('Core not initialized');

    const sequenceGt =
      options?.sequenceGt != null ? BigInt(options.sequenceGt) : null;
    const sequenceLt =
      options?.sequenceLt != null ? BigInt(options.sequenceLt) : null;

    const results = await Promise.allSettled(
      this.servers.map((server) =>
        this.core!.list_events(
          server,
          options?.limit ?? null,
          options?.identity ?? null,
          options?.collection ?? null,
          options?.signedBy?.key ?? null,
          options?.signedBy?.keyType ?? null,
          sequenceGt,
          sequenceLt,
        ),
      ),
    );

    const bundles: Proto.EventBundle[] = [];
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('listEvents failed for a server:', result.reason);
        continue;
      }
      const response = Proto.ListEventsResponse.fromBinary(result.value);
      bundles.push(...response.eventBundles);
    }

    return bundles;
  }

  /**
   * Fetch a curated feed from every configured server and return the
   * aggregated events. Does not persist — callers decide what to do with
   * the response.
   *
   * For `FeedAlgorithm.FOLLOWING` the caller must be authenticated locally
   * (an active identity) so that the server can scope the feed to their
   * follow graph.
   */
  async getFeed(options?: {
    algorithm?: Proto.FeedAlgorithm;
    limit?: number | null;
    identity?: string | null;
  }): Promise<Proto.EventBundle[]> {
    if (!this.core) throw new Error('Core not initialized');

    const algorithm = options?.algorithm ?? Proto.FeedAlgorithm.UNSPECIFIED;
    const identity =
      options?.identity ??
      (algorithm === Proto.FeedAlgorithm.FOLLOWING
        ? this.activeIdentityKey
        : null);

    if (algorithm === Proto.FeedAlgorithm.FOLLOWING && !identity) {
      throw new Error('getFeed(FOLLOWING) requires an active identity');
    }

    const results = await Promise.allSettled(
      this.servers.map((server) =>
        this.core!.get_feed(
          server,
          algorithm,
          options?.limit ?? null,
          identity,
        ),
      ),
    );

    const bundles: Proto.EventBundle[] = [];
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('getFeed failed for a server:', result.reason);
        continue;
      }
      const response = Proto.GetFeedResponse.fromBinary(result.value);
      bundles.push(...response.eventBundles);
    }

    return bundles;
  }

  /**
   * Fetch a parent post and its direct replies for a given EventKey.
   * Queries every configured server and returns the first successful
   * response. Does not persist — callers decide what to do with the
   * response.
   */
  async getPostThread(options: {
    eventKey: Proto.EventKey;
    limit?: number | null;
  }): Promise<Proto.GetPostThreadResponse | null> {
    if (!this.core) throw new Error('Core not initialized');

    const requestBytes = Proto.GetPostThreadRequest.toBinary(
      Proto.GetPostThreadRequest.create({
        eventKey: options.eventKey,
        limit: options.limit ?? 0,
      }),
    );

    const results = await Promise.allSettled(
      this.servers.map((server) =>
        this.core!.get_post_thread(server, requestBytes),
      ),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('getPostThread failed for a server:', result.reason);
        continue;
      }
      return Proto.GetPostThreadResponse.fromBinary(result.value);
    }

    return null;
  }

  /**
   * Return non-deleted event bundles for an `(identity, collection)` stream
   * from the local core. Tombstone CRDT is applied by the core: any event
   * targeted by a `Delete` content in the same collection is excluded.
   * Content-type filtering is left to the caller.
   *
   * Requires the core to be hydrated — e.g. client initialization (which
   * replays from local storage) and optionally `sync()` to pull new events
   * from servers.
   */
  listValidEvents(identity: string, collection: number): Proto.EventBundle[] {
    if (!this.core) throw new Error('Core not initialized');
    const bytes = this.core.list_valid_events(identity, collection);
    return Proto.ListEventsResponse.fromBinary(bytes).eventBundles;
  }

  /**
   * Decode an image, resize into `width` x `height` per `mode`, and
   * encode as JPEG via the core.
   *
   * - `"fill"` (default): scale + center-crop, output is exactly `width` x `height`.
   * - `"fit"`: preserve aspect ratio, output fits inside `width` x `height`.
   */
  processImageToJpeg(
    image: Uint8Array,
    width: number,
    height: number,
    mode: 'fill' | 'fit' = 'fill',
  ): Uint8Array {
    if (!this.core) throw new Error('Core not initialized');
    return this.core.process_image_to_jpeg(image, width, height, mode);
  }

  /**
   * Upload a blob body to all configured servers. The server verifies
   * that `body` hashes to `blob.digest` before persisting. Rejections
   * from individual servers are logged but do not throw.
   */
  async uploadBlob(blob: Proto.Blob, body: Uint8Array): Promise<void> {
    if (!this.core) throw new Error('Core not initialized');

    const requestBytes = Proto.UploadBlobRequest.toBinary(
      Proto.UploadBlobRequest.create({ blob, body }),
    );

    const results = await Promise.allSettled(
      this.servers.map((server) =>
        this.core!.upload_blob(server, requestBytes),
      ),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('uploadBlob failed for a server:', result.reason);
      }
    }
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
   * Pull signed events for the active identity from all configured servers
   * and persist new ones locally. Existing events/content are not overwritten.
   *
   * @returns The number of new events persisted
   */
  async pull(): Promise<number> {
    if (!this.core) throw new Error('Core not initialized');
    if (!this.activeIdentityKey) throw new Error('No active identity');

    const bundles = await this.listEvents({
      identity: this.activeIdentityKey,
    });

    let newCount = 0;
    for (const bundle of bundles) {
      if (!bundle.signedEvent) continue;

      if (bundle.serializedContent?.contentBytes) {
        try {
          const event = Proto.Event.fromBinary(bundle.signedEvent.eventBytes);
          if (event.contentDigest?.value) {
            const existing = await this.storage.content.get(
              event.contentDigest,
            );
            if (!existing) {
              const content = Proto.Content.fromBinary(
                bundle.serializedContent.contentBytes,
              );
              await this.storage.content.save(event.contentDigest, content);
            }
          }
        } catch {
          // content decode failed, skip
        }
      }

      try {
        await this.storage.events.save(bundle.signedEvent);
        newCount++;
      } catch {
        // duplicate event, skip
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
    this.activeIdentityKey = this.storageDriver.loadActiveIdentityKey(
      keyPair.publicKey.key,
    );
  }

  /**
   * Explicitly set the active identity key and persist it.
   */
  public setActiveIdentityKey(identityKey: string | null) {
    this.activeIdentityKey = identityKey;
    if (!this.currentKeyPair) return;
    this.storageDriver.saveActiveIdentityKey(
      this.currentKeyPair.publicKey.key,
      identityKey,
    );
  }

  /**
   * Look up the v2 identity key bound to the given key pair locally.
   * Returns null if this device has never associated an identity with the pair.
   */
  public getIdentityKeyFor(keyPair: KeyPair): string | null {
    return this.storageDriver.loadActiveIdentityKey(keyPair.publicKey.key);
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

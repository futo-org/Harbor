import {
  ClientState,
  ContentManager,
  EventService,
  HydrationStatus,
  IdentityManager,
  InitializationStep,
  KeyPairManager,
  PairingSessionManager,
} from './client-internal';
import { COLLECTION, KEY_TYPE, type Collection } from './constants';
import { HTTPClient } from './http';
import { sha256 } from '@noble/hashes/sha2.js';
import type {
  ICryptoManager,
  IFileStoreDriver,
  IStorageDriver,
} from './platform-interfaces';
import * as Proto from './proto/v2';
import { StorageHandle } from './datastore/storage-handle';
import { bytesToHex, toDigestKey } from './utils/hex';

import type { PolycentricCoreLike } from '@polycentric/rs-core-uniffi-web';
// `./generated` is the pure-JS bindings subpath; it exposes the Query
// class and QueryStatus enum without dragging in the wasm asset. The
// uniffi runtime that backs these (`uniffi-bindgen-react-native`) is
// externalised in webpack.config.js so consumers resolve it at runtime.
import { Query, QueryStatus } from '@polycentric/rs-core-uniffi-web/generated';

type CoreType = PolycentricCoreLike;

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
  /**
   * The uniffi-generated `PolycentricCore` instance from
   * `@polycentric/react-native`. Owns crypto, local stores, image
   * processing, and gRPC client transport.
   */
  core: CoreType;
  storageDriver: IStorageDriver;
  filestoreDriver: IFileStoreDriver;
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
  public readonly pairingSessionManager = new PairingSessionManager(this);

  public readonly httpClient = new HTTPClient();

  private state = ClientState.UNINITIALIZED;
  public step = '';
  public hydrationStatus: HydrationStatus = HydrationStatus.NOT_STARTED;
  public error: Error | null = null;

  public readonly core: CoreType;

  public currentKeyPair: KeyPair | null = null;
  /** The identity key the current key pair is actively using. Set by publishIdentity or claimIdentity. */
  public activeIdentityKey: string | null = null;
  public servers: string[] = ['http://localhost:3000'];

  /** CDN URL per server, populated by `fetchServerInfo` during init. */
  private cdnUrlByServer = new Map<string, string>();

  public readonly cryptoManager: ICryptoManager;

  public storageHandle: StorageHandle | undefined;
  public readonly storageDriver: IStorageDriver;
  public readonly filestoreDriver: IFileStoreDriver;

  constructor(config: PolycentricClientConfig) {
    this.core = config.core;
    this.cryptoManager = config.cryptoManager;
    this.storageDriver = config.storageDriver;
    this.filestoreDriver = config.filestoreDriver;
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

      // Push the JS-side server list into the rust core so that
      // observables that fan out to every configured server (e.g.
      // `getIdentityFeed`) actually have somewhere to call.
      this.core.setServers(this.servers);

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
    const results = await Promise.allSettled(
      this.servers.map(async (server) => {
        const bytes = await this.core.getServerInfo(server);
        const response = Proto.GetServerInfoResponse.fromBinary(
          new Uint8Array(bytes),
        );
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
    return `${cdn}/blob/${toDigestKey(digest)}`;
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

    await this.setCurrentKeyPair(identity);
    return true;
  }

  /**
   * Hydrate the Rust core's in-memory stores from persistent storage.
   * The Rust stores are ephemeral (reset on every load) so anything the
   * core needs (events for clocks/sequences, content for identity lookups)
   * must be copied in at startup.
   */
  async copyEvents(events?: Proto.SignedEvent[]) {
    const signedEvents = events ?? (await this.storage.events.getAll());

    this.core.copyEvents(
      signedEvents.map(
        (s) => Proto.SignedEvent.toBinary(s).buffer as ArrayBuffer,
      ),
    );
  }

  /**
   * A temporary function to copy all the content the browser is aware of.
   * We should make this smarter with the EventBundles, maybe.
   */
  async copyContents(
    contents?: { digest: Proto.ContentDigest; content: Proto.Content }[],
  ) {
    const list = contents ?? (await this.storage.content.getAll());

    this.core.copyContents(
      list.map((r) => ({
        digestBytes: Proto.ContentDigest.toBinary(r.digest)
          .buffer as ArrayBuffer,
        contentBytes: Proto.Content.toBinary(r.content).buffer as ArrayBuffer,
      })),
    );
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

    const sequence = this.core.nextSequence(this.activeIdentityKey, collection);

    // identity_sequence must reference an identity event signed by the
    // current keypair.
    const identitySequence =
      collection === COLLECTION.IDENTITY
        ? sequence
        : this.core.getIdentitySequence(
            this.activeIdentityKey,
            Proto.PublicKey.toBinary(this.currentKeyPair.publicKey)
              .buffer as ArrayBuffer,
          );

    if (!identitySequence) {
      throw new Error(
        'Cannot build event: current keypair has no identity event for the active identity (broken pairing?)',
      );
    }

    const previousSignature = new Uint8Array(
      this.core.previousSignature(this.activeIdentityKey, collection),
    );
    const previousRoot = new Uint8Array(
      this.core.previousRoot(this.activeIdentityKey, collection),
    );

    const event = Proto.Event.create({
      key: Proto.EventKey.create({
        collection,
        identity: this.activeIdentityKey,
        signedBy: this.currentKeyPair.publicKey,
        sequence,
      }),
      identitySequence,
      previousSignature,
      previousRoot,
      contentDigest: this.contentManager.buildDigest(content),
      createdAt: BigInt(Date.now()),
    });

    const identityContentForVC =
      collection === COLLECTION.IDENTITY &&
      content.contentBody.oneofKind === 'identity'
        ? content.contentBody.identity
        : undefined;
    event.vectorClock = this.buildVectorClock(event, identityContentForVC);

    return event;
  }

  /**
   * Sign an event with the current key pair.
   */
  async signEvent(event: Proto.Event): Promise<Proto.SignedEvent> {
    const eventBytes = Proto.Event.toBinary(event);

    const signedEventBytes = await this.core.signEvent(
      eventBytes.buffer as ArrayBuffer,
      {
        sign: async (bytes: ArrayBuffer): Promise<ArrayBuffer> => {
          if (!this.currentKeyPair) {
            throw new Error('No keypair');
          }
          const signature = await this.crypto.sign(
            this.currentKeyPair.privateKey.key,
            new Uint8Array(bytes),
            this.currentKeyPair.keyType,
          );
          return signature.buffer.slice(
            signature.byteOffset,
            signature.byteOffset + signature.byteLength,
          ) as ArrayBuffer;
        },
      },
    );
    return Proto.SignedEvent.fromBinary(new Uint8Array(signedEventBytes));
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

    this.core.copyEvents([
      Proto.SignedEvent.toBinary(signedEvent).buffer as ArrayBuffer,
    ]);

    if (content) {
      const event = Proto.Event.fromBinary(signedEvent.eventBytes);
      if (event.contentDigest) {
        this.core.copyContents([
          {
            digestBytes: Proto.ContentDigest.toBinary(event.contentDigest)
              .buffer as ArrayBuffer,
            contentBytes: Proto.Content.toBinary(content).buffer as ArrayBuffer,
          },
        ]);
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
  buildVectorClock(
    event: Proto.Event,
    identityContent?: Proto.Identity,
  ): Proto.VectorClock {
    const clockBytes = this.core.buildVectorClock(
      event.key!.identity,
      event.key!.collection,
      event.identitySequence,
      Proto.PublicKey.toBinary(event.key!.signedBy!).buffer as ArrayBuffer,
      event.key!.sequence,
      identityContent
        ? (Proto.Identity.toBinary(identityContent).buffer as ArrayBuffer)
        : undefined,
    );
    return Proto.VectorClock.fromBinary(new Uint8Array(clockBytes));
  }

  /**
   * Generic query wrapper around `core.listEvents`. Subscribes to the
   * fan-out observable, accumulates `event_bundles` from each
   * per-server emission, and resolves once the observable completes.
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
    const sequenceGt =
      options?.sequenceGt != null ? BigInt(options.sequenceGt) : undefined;
    const sequenceLt =
      options?.sequenceLt != null ? BigInt(options.sequenceLt) : undefined;

    // `signedBy.key` is a Uint8Array view into the wire-decoded
    // message buffer (protobuf-ts uses subarray). `.buffer` would be
    // the whole message buffer, not just the key bytes — copy through
    // `.slice()` so the FFI receives exactly the public-key bytes.
    const signedBy = options?.signedBy
      ? {
          keyType: options.signedBy.keyType,
          key: options.signedBy.key.slice().buffer as ArrayBuffer,
        }
      : undefined;

    const queryKey = [
      'list_events',
      String(options?.limit ?? ''),
      options?.identity ?? '',
      String(options?.collection ?? ''),
      options?.signedBy
        ? `${options.signedBy.keyType}:${bytesToHex(options.signedBy.key)}`
        : '',
      String(sequenceGt ?? ''),
      String(sequenceLt ?? ''),
    ];

    return new Promise<Proto.EventBundle[]>((resolve, reject) => {
      const observable = this.core.fetchQuery(
        queryKey,
        new Query.ListEvents({
          size: options?.limit ?? undefined,
          identity: options?.identity ?? undefined,
          collection: options?.collection ?? undefined,
          signedBy,
          sequenceGt,
          sequenceLt,
        }),
        undefined,
      );

      let latest: Proto.EventBundle[] = [];
      // Observable never `complete()`s — resolve on the Loading→Success
      // transition once every server slot has reported.
      const subscription = observable.subscribe({
        next: (result) => {
          if (result.data) {
            const response = Proto.ListEventsResponse.fromBinary(
              new Uint8Array(result.data),
            );
            latest = response.eventBundles;
          }
          if (result.status === QueryStatus.Success) {
            subscription.unsubscribe();
            resolve(latest);
          }
        },
        error: (message: string) => {
          subscription.unsubscribe();
          reject(new Error(message));
        },
        complete: () => {},
      });
    });
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
    const bytes = this.core.listValidEvents(identity, collection);
    return Proto.ListEventsResponse.fromBinary(new Uint8Array(bytes))
      .eventBundles;
  }

  /**
   * Decode an image, resize into `width` x `height` per `mode`, and
   * encode as JPEG via the core. Returns the JPEG bytes plus the
   * actual output dimensions.
   *
   * - `"fill"` (default): scale + center-crop, output is exactly `width` x `height`.
   * - `"fit"`: preserve aspect ratio, output fits inside `width` x `height`.
   */
  processImageToJpeg(
    image: Uint8Array,
    width: number,
    height: number,
    mode: 'fill' | 'fit' = 'fill',
  ): { bytes: Uint8Array; width: number; height: number } {
    const result = this.core.processImageToJpeg(
      image.buffer as ArrayBuffer,
      width,
      height,
      mode,
    );
    return {
      bytes: new Uint8Array(result.bytes),
      width: result.width,
      height: result.height,
    };
  }

  /**
   * Sign a `RegisterPushNotificationRequest` with the active key pair and
   * deliver it to every configured server via gRPC-web. Per-server failures
   * are logged but do not throw — registration is best-effort across the
   * server set.
   */
  async registerPushNotifications(
    servers: string[],
    request: Proto.RegisterPushNotificationRequest,
  ): Promise<void> {
    if (!this.currentKeyPair) {
      throw new Error('registerPushNotifications requires an active key pair');
    }

    const messageBytes =
      Proto.RegisterPushNotificationRequest.toBinary(request);
    const signature = await this.crypto.sign(
      this.currentKeyPair.privateKey.key,
      messageBytes,
      this.currentKeyPair.keyType,
    );
    const signedMessageBytes = Proto.SignedMessage.toBinary(
      Proto.SignedMessage.create({
        publicKey: this.currentKeyPair.publicKey,
        signature,
        messageBytes,
      }),
    );

    const results = await Promise.allSettled(
      servers.map((server) =>
        this.core.registerPushNotifications(
          server,
          signedMessageBytes.buffer as ArrayBuffer,
        ),
      ),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(
          'registerPushNotifications failed for a server:',
          result.reason,
        );
      }
    }
  }

  /**
   * Hash `bytes` and save to the local filestore. Returns the matching
   * `Blob` proto. Does not upload to servers.
   */
  async commitBlob(bytes: Uint8Array, mimeType: string): Promise<Proto.Blob> {
    const digest: Proto.ContentDigest = {
      type: Proto.ContentDigestType.SHA256,
      value: sha256(bytes),
    };
    await this.filestoreDriver.put(digest, bytes);
    return Proto.Blob.create({
      digest,
      mimeType,
      size: BigInt(bytes.length),
    });
  }

  /**
   * Fetch a blob body by digest from any server CDN that has it.
   * Returns null if no configured server's CDN serves it.
   */
  async fetchBlobBytes(
    digest: Proto.ContentDigest,
  ): Promise<Uint8Array | null> {
    const suffix = `/blob/${toDigestKey(digest)}`;
    for (const server of this.servers) {
      const cdn = this.cdnUrlByServer.get(server);
      if (!cdn) continue;
      try {
        const res = await fetch(`${cdn}${suffix}`);
        if (!res.ok) continue;
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        // try next server
      }
    }
    return null;
  }

  /**
   * Upload a blob body to all configured servers. The server verifies
   * that `body` hashes to `blob.digest` before persisting. Rejections
   * from individual servers are logged but do not throw.
   */
  async uploadBlob(blob: Proto.Blob, body: Uint8Array): Promise<void> {
    const requestBytes = Proto.UploadBlobRequest.toBinary(
      Proto.UploadBlobRequest.create({ blob, body }),
    );

    const results = await Promise.allSettled(
      this.servers.map((server) =>
        this.core.uploadBlob(server, requestBytes.buffer as ArrayBuffer),
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
    if (!this.currentKeyPair) throw new Error('No active key pair');
    if (!this.activeIdentityKey) throw new Error('No active identity');

    const localEvents = await this.storage.events.getAll();

    // Build event bundles with content for events matching the active identity
    const bundles: Proto.EventBundle[] = [];
    for (const signedEvent of localEvents) {
      const event = Proto.Event.fromBinary(signedEvent.eventBytes);

      // Only push events belonging to the active identity
      if (event.key?.identity !== this.activeIdentityKey) continue;

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
      this.servers.map((server) =>
        this.core.putEvents(server, requestBytes.buffer as ArrayBuffer),
      ),
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
    if (!this.activeIdentityKey) throw new Error('No active identity');

    const bundles = await this.listEvents({
      identity: this.activeIdentityKey,
    });

    let newCount = 0;
    const signedEvents: Proto.SignedEvent[] = [];
    const contents: {
      digest: Proto.ContentDigest;
      content: Proto.Content;
    }[] = [];
    for (const bundle of bundles) {
      if (!bundle.signedEvent) continue;

      if (bundle.serializedContent?.contentBytes) {
        try {
          const event = Proto.Event.fromBinary(bundle.signedEvent.eventBytes);
          if (event.contentDigest?.value) {
            const existing = await this.storage.content.get(
              event.contentDigest,
            );
            const content = Proto.Content.fromBinary(
              bundle.serializedContent.contentBytes,
            );
            if (!existing) {
              await this.storage.content.save(event.contentDigest, content);
            }
            contents.push({ digest: event.contentDigest, content });
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
      signedEvents.push(bundle.signedEvent);
    }

    // mirror into rs-core
    await this.copyEvents(signedEvents);
    await this.copyContents(contents);

    // Catch any of our own referenced blobs so they persist locally.
    await Promise.all(
      contents.map(({ content }) => this.contentManager.pullBlobs(content)),
    );

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

  public async setCurrentKeyPair(keyPair: KeyPair): Promise<void> {
    this.currentKeyPair = keyPair;
    // Restore saved identity key for this key pair
    this.activeIdentityKey = await this.storageDriver.loadActiveIdentityKey(
      keyPair.publicKey.key,
    );
  }

  /**
   * Explicitly set the active identity key and persist it.
   */
  public async setActiveIdentityKey(identityKey: string | null): Promise<void> {
    this.activeIdentityKey = identityKey;
    if (!this.currentKeyPair) return;
    await this.storageDriver.saveActiveIdentityKey(
      this.currentKeyPair.publicKey.key,
      identityKey,
    );
  }

  /**
   * Look up the v2 identity key bound to the given key pair locally.
   * Returns null if this device has never associated an identity with the pair.
   */
  public getIdentityKeyFor(keyPair: KeyPair): Promise<string | null> {
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

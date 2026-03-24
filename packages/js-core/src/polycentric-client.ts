import {
  ClaimManager,
  ClientState,
  ContentManager,
  EventService,
  HydrationStatus,
  IdentityManager,
  InitializationStep,
  SyncService,
} from './client-internal';
import { Defaults, HydrationStrategy, KEY_TYPE } from './constants';
import { HTTPClient } from './http';
import type {
  ICoreBridge,
  ICryptoManager,
  IPolycentricCore,
  IStorageDriver,
} from './platform-interfaces';
import {
  ClaimFieldEntry,
  EventCreationData,
  EventKey,
  Events,
  FeedResult,
  ImageManifest,
  LWWElement,
  Pointer,
  PrivateKey,
  Process,
  Event as ProtobufEvent,
  PublicKey,
  Reference,
  SignedEvent,
} from './proto/polycentric';
import { FeedQuery, QueryManager } from './queries';
import { StorageHandle } from './storage/storage-handle';
import { ModerationFilters, ServerError } from './utils';

export interface KeyPair {
  keyType: bigint;
  privateKey: PrivateKey;
  publicKey: PublicKey;
}

export interface Identity {
  keyPair: KeyPair;
  process: Process;
}

export interface IdentityOptions {
  keyType?: bigint;
  setAsCurrent?: boolean;
  ephemeral?: boolean;
}

/**
 * PolycentricClientConfig defines the dependencies and configuration for a PolycentricClient.
 *
 * @param coreBridge - A runtime bridge for a given platform.
 * @param storageDriver - A storage backend for a given platform (e.g. sql, in-memory, indexedDB etc).
 * @param cryptoManager - A crypto manager for a given platform.
 * @param hydrationStrategy - How the runtime cache is hydrated from the database.
 *   Defaults to {@link HydrationStrategy.FULL}.
 */
export interface PolycentricClientConfig {
  coreBridge: ICoreBridge;
  storageDriver: IStorageDriver;
  cryptoManager: ICryptoManager;
  hydration?: {
    strategy: HydrationStrategy;
    batchSize?: number;
  };
}

/**
 * PolycentricClient is the top level API for the Polycentric SDK.
 *
 * @example
 * import { PolycentricClient } from "@polycentric/core";
 * import {
 *   BrowserWasmBridge,
 *   SqlStorageDriver,
 *   BrowserCryptoManager
 * } from "@polycentric/browser";
 *
 * const client = await PolycentricClient.create({
 *   coreBridge: new BrowserWasmBridge(),
 *   storageDriver: await SqlStorageDriver.create(),
 *   cryptoManager: new BrowserCryptoManager(),
 * });
 *
 * await client.createIdentity();
 * client.createPost("Hello Polycentric")
 */
export class PolycentricClient {
  public readonly events = new EventService();
  public readonly synchronization = new SyncService(this);

  public readonly identityManager = new IdentityManager(this);
  public readonly claimManager = new ClaimManager(this);
  public readonly queryManager = new QueryManager(this);
  public readonly contentManager = new ContentManager(this);

  public readonly httpClient = new HTTPClient();

  private _state = ClientState.UNINITIALIZED;
  private _step = '';
  private _hydrationStatus: HydrationStatus = HydrationStatus.NOT_STARTED;
  private _error: Error | null = null;

  private _core: IPolycentricCore | undefined;
  private readonly _coreBridge: ICoreBridge;

  private _process: Process | null = null;
  private _currentKeyPair: KeyPair | null = null;
  private _identityIsEphemeral: boolean = true;
  private readonly _cryptoManager: ICryptoManager;

  private _storageHandle: StorageHandle | undefined;
  private readonly _storageDriver: IStorageDriver;
  private readonly _hydration: {
    strategy: HydrationStrategy;
    batchSize: number;
  };

  private constructor(config: PolycentricClientConfig) {
    this._coreBridge = config.coreBridge;
    this._cryptoManager = config.cryptoManager;
    this._storageDriver = config.storageDriver;
    this._hydration = {
      strategy: config.hydration?.strategy ?? Defaults.HYDRATION.STRATEGY,
      batchSize: config.hydration?.batchSize ?? Defaults.HYDRATION.BATCH_SIZE,
    };
  }

  /**
   * Creates a new PolycentricClient instance.
   *
   * @param config - The configuration for the PolycentricClient
   * @returns An initialized PolycentricClient instance
   */
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
      if (this._coreBridge.initialized()) {
        this._core = this._coreBridge.getCoreInstance();
      } else {
        await this._coreBridge.initialize();
        this._core = this._coreBridge.getCoreInstance();
      }

      this.setStep(InitializationStep.SETTING_UP_STORAGE);
      this._storageHandle = new StorageHandle({
        eventRepository: this._storageDriver.createEventRepository(),
        keysRepository: this._storageDriver.createKeysRepository(),
        processStateRepository:
          this._storageDriver.createProcessStateRepository(),
        eventAckRepository: this._storageDriver.createEventAckRepository(),
        processIdRepository: this._storageDriver.createProcessIdRepository(),
      });

      this.setStep(InitializationStep.LOADING_PROCESS_ID);
      this._process = await this._storageHandle.processId.getProcessId();

      if (!this._process) {
        this.setStep(InitializationStep.CREATING_PROCESS_ID);
        this._process = await this._createAndStoreProcessId();
      }

      this.setStep(InitializationStep.HYDRATING_EVENTS);
      await this._hydrate();

      const restoredIdentity = await this._restoreStoredIdentity();
      if (!restoredIdentity) {
        this.setStep(InitializationStep.CREATING_EPHEMERAL_IDENTITY);
        await this.createIdentity({
          keyType: KEY_TYPE.ED25519,
          setAsCurrent: true,
          ephemeral: true,
        });
      }

      this.setStep(InitializationStep.COMPLETE);
      this.setState(ClientState.READY);
    } catch (error) {
      this.setError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async _hydrate() {
    this.setHydrationStatus(HydrationStatus.IN_PROGRESS);

    try {
      switch (this._hydration.strategy) {
        case HydrationStrategy.FULL:
          await this._hydrateFull();
          break;
        case HydrationStrategy.FULL_ASYNC:
          await this._hydrateFullAsync();
          break;
        case HydrationStrategy.HYBRID:
          await this._hydrateHybrid();
          break;
        case HydrationStrategy.LAZY:
          await this._hydrateLazy();
          break;
      }
    } catch (error) {
      this.setHydrationStatus(HydrationStatus.FAILED);
      throw error;
    }
  }

  private async _hydrateFull() {
    console.log('Hydrating full');

    console.log('Loading events from storage');

    const events = await this.storage.events.getAllEvents();

    console.log(`Ingesting ${events.length} events into WASM core`);

    this.core.ingest_events(Events.toBinary({ events }));

    this.setHydrationStatus(HydrationStatus.COMPLETED);
  }

  private async _hydrateFullAsync() {
    console.log('Hydrating full asynchronously');

    let currentOffset = undefined;

    currentOffset = await this.loadBatch(
      this._hydration.batchSize,
      currentOffset,
    );

    this.loadBatchesStartingFrom(
      this._hydration.batchSize,
      currentOffset,
    ).catch((error) => {
      this.setHydrationStatus(HydrationStatus.FAILED);
      this.setError(error instanceof Error ? error : new Error(String(error)));
    });
  }

  private async loadBatchesStartingFrom(batchSize: number, offset?: number) {
    let currentOffset = offset;

    for (let i = 0; i < 10 ** 6; i++) {
      currentOffset = await this.loadBatch(batchSize, currentOffset);
      if (currentOffset === undefined) break;

      await new Promise((resolve) => setTimeout(resolve, 1)); // Yield
    }

    this.setHydrationStatus(HydrationStatus.COMPLETED);
  }

  private async loadBatch(
    batchSize: number,
    offset?: number,
  ): Promise<number | undefined> {
    const result = await this.storage.events.getEventsBatch(batchSize, offset);

    if (result.events.length === 0) return undefined;

    this.core.ingest_events(Events.toBinary({ events: result.events }));

    return result.offset;
  }

  private async _hydrateHybrid() {
    console.log(
      'Unimplemented: Hybrid hydration strategy, falling back to full hydration',
    );
    await this._hydrateFull();
  }

  private async _hydrateLazy() {
    console.log(
      'Unimplemented: Lazy hydration strategy, falling back to full hydration',
    );
    await this._hydrateFull();
  }

  private async _createAndStoreProcessId(): Promise<Process> {
    if (!this._storageHandle) {
      throw new Error('Storage handle not initialized');
    }

    const processId = await this._cryptoManager.generateProcessId();
    const process = Process.create({ process: processId });
    await this._storageHandle.processId.setProcessId(process);

    return process;
  }

  private async _restoreStoredIdentity(): Promise<boolean> {
    const identities = await this.getAllIdentities();
    const identity = identities[0];

    if (!identity) {
      return false;
    }

    this.setCurrentKeyPair(identity, false);
    return true;
  }

  /**
   * Synchronizes the client's events with those of the selected servers
   */
  public async sync(): Promise<ServerError[]> {
    return await this.synchronization.sync();
  }

  public async syncEventsForSystem(system: PublicKey): Promise<ServerError[]> {
    const result = await this.core.sync_events_for_system(
      PublicKey.toBinary(system),
      this.httpClient.getHead.bind(this.httpClient),
      this.httpClient.getRanges.bind(this.httpClient),
      this.httpClient.getEvents.bind(this.httpClient),
      this.httpClient.postEvents.bind(this.httpClient),
      async (eventsBytes: Uint8Array) => {
        const events = Events.fromBinary(eventsBytes);
        await this.storage.events.persistEvents(events.events);
      },
    );

    return result.errors;
  }

  public async ingestEvent(signedEvent: SignedEvent): Promise<void> {
    this.core.ingest_events(
      Events.toBinary({
        events: [signedEvent],
      }),
    );
    await this.storage.events.persistEvent(signedEvent);
  }

  /**
   * Creates a new event for the current identity.
   *
   * @param eventData - The event data to create.
   * @returns The resulting signed event.
   */
  createEventRaw(eventData: EventCreationData): Promise<SignedEvent> {
    return this.contentManager._createEvent(eventData);
  }

  /**
   * Creates a new identity for the current process.
   *
   * @param keyType - The type of key to use for the identity. @default 0n (ED25519)
   * @param setAsCurrent - Whether to set the new identity as the current identity. @default true
   * @returns The new key pair.
   */
  async createIdentity(options: IdentityOptions = {}): Promise<KeyPair> {
    return this.identityManager.createIdentity({
      keyType: options.keyType ?? KEY_TYPE.ED25519,
      setAsCurrent: options.setAsCurrent,
      ephemeral: options.ephemeral,
    });
  }

  /**
   * Imports and stores an existing identity using its private key
   *
   * @param privateKey The protobuf object representing the private key
   * @param setAsCurrent Whether to set the imported identity as the current identity. @default true
   */
  async importIdentity(
    privateKey: PrivateKey,
    setAsCurrent: boolean = true,
  ): Promise<KeyPair> {
    return this.identityManager.importIdentity(privateKey, setAsCurrent);
  }

  /**
   * Gets all stored identities.
   *
   * @returns An array containing all stored key pairs.
   */
  async getAllIdentities(): Promise<KeyPair[]> {
    return this.identityManager.getAllIdentities();
  }

  /**
   * Removes an identity from storage
   * @param publicKey The public key of the identity to be removed
   */
  async removeIdentity(publicKey: PublicKey) {
    await this.identityManager.removeIdentity(publicKey);
  }

  async deleteIdentity(publicKey?: PublicKey): Promise<void> {
    const isCurrent =
      !publicKey ||
      (this._currentKeyPair &&
        this._currentKeyPair.publicKey.key?.toString() ===
          publicKey.key?.toString());

    if (isCurrent) {
      const currentPublicKey = this.currentIdentity.keyPair.publicKey;
      await this.removeIdentity(currentPublicKey);

      const remaining = await this.getAllIdentities();
      if (remaining.length > 0) {
        await this.switchIdentity(remaining[0]!.publicKey);
        return;
      }

      await this.createIdentity({
        keyType: KEY_TYPE.ED25519,
        setAsCurrent: true,
        ephemeral: true,
      });
    } else {
      await this.removeIdentity(publicKey!);
      if (this._currentKeyPair && this._process) {
        this.events.emitIdentityChanged({
          keyPair: this._currentKeyPair,
          process: this._process,
        });
      }
    }
  }

  /**
   * Switches the current identity to a new key pair.
   *
   * @param publicKey - The public key of the new identity.
   * @returns The new key pair.
   */
  async switchIdentity(publicKey: PublicKey): Promise<KeyPair> {
    return this.identityManager.switchIdentity(publicKey);
  }

  /**
   * Queries the explore feed from the endpoint from all servers for the current identity
   *
   * @param perServerLimit The limit of how many events should be returned from each server
   * @param moderationFilters The moderation filters to be passed to each server
   */
  queryExploreFeed(
    perServerLimit?: number,
    moderationFilters?: ModerationFilters,
  ): FeedQuery {
    return this.queryManager.queryExploreFeed(
      perServerLimit,
      moderationFilters,
    );
  }

  /**
   * Queries the explore feed only from a particular server
   *
   * @param server The server to query
   * @param limit The limit of how many events should be returned
   * @param moderationFilters The moderation filters to be passed to the server
   */
  queryExploreFeedSpecificServer(
    server: string,
    limit?: number,
    moderationFilters?: ModerationFilters,
  ): FeedQuery {
    return this.queryManager.queryExploreFeedSpecificServer(
      server,
      limit,
      moderationFilters,
    );
  }

  /**
   * Queries the search endpoint for all servers
   *
   * @param searchQuery The text to search for
   * @param searchType The type of search to use
   * @param perServerLimit The limit of how many events should be returned from each server
   * @param moderationFilters The moderation filters to be passed to the server
   */
  querySearch(
    searchQuery: string,
    searchType: 'messages' | 'profiles',
    perServerLimit?: number,
    moderationFilters?: ModerationFilters,
  ): FeedQuery {
    return this.queryManager.querySearch(
      searchQuery,
      searchType,
      perServerLimit,
      moderationFilters,
    );
  }

  /**
   * Queries the following feed for the current system
   *
   * @param limit The number of events that should be returned
   */
  queryFollowingFeed(limit: number): FeedQuery {
    return this.queryManager.queryFollowingFeed(limit);
  }

  /**
   * Queries the feed of events from a specific author
   * @param profile The system whose feed to query
   * @param limit The number of events that should be returned
   */
  queryAuthorFeed(profile: PublicKey, limit: number): FeedQuery {
    return this.queryManager.queryAuthorFeed(profile, limit);
  }

  /**
   * Queries the feed of events with a specific reference
   * @param reference The reference object to query events for
   * @param moderationFilters The moderation filters to be passed to the server
   */
  queryReferencesFeed(
    reference: Reference,
    moderationFilters?: ModerationFilters,
  ): FeedQuery {
    return this.queryManager.queryReferencesFeed(reference, moderationFilters);
  }

  /**
   * Queries the feed of events which the current user has liked
   *
   * @param limit The number of events that should be returned
   */
  queryLikesFeed(limit: number): FeedQuery {
    return this.queryManager.queryLikesFeed(limit);
  }

  /**
   * Queries the feed of comments on the current user's posts
   *
   * @param moderationFilters The moderation filters to be passed to the server
   */
  queryCommentsFeed(moderationFilters?: ModerationFilters): FeedQuery {
    return this.queryManager.queryCommentsFeed(moderationFilters);
  }

  /**
   * Queries the current opinion (like/dislike/neutral) for a given event.
   *
   * @param targetPointer - The pointer to query the opinion for.
   * @returns The current opinion for the pointer.
   */
  queryCurrentOpinion(targetPointer: Pointer): LWWElement | null {
    return this.queryManager.queryCurrentOpinion(targetPointer);
  }

  /**
   * Queries the deletion status for a given event
   */
  queryIsDeleted(targetPointer: Pointer): boolean {
    return this.queryManager.queryIsDeleted(targetPointer);
  }

  /**
   * Query feed events for a system with cursor support for pagination
   *
   * @param system - The system to query feed events for
   * @param options - Query options including time range, limit, and cursor
   * @returns FeedResult containing events and cursor for next page
   */
  queryFeed(
    system: PublicKey,
    options: {
      startTime?: bigint;
      endTime?: bigint;
      limit?: number;
      cursor?: Uint8Array;
    } = {},
  ): FeedResult {
    return this.queryManager.queryFeed(system, options);
  }

  /**
   * Queries the username for a given system.
   *
   * @param system - The system to query the username for.
   * @returns The username for the system, or null if not found.
   */
  queryUsername(system: PublicKey): Promise<string | null> {
    return this.queryManager.queryUsername(system);
  }

  /**
   * Queries the description for a given system.
   *
   * @param system - The system to query the description for.
   * @returns The description for the system, or null if not found.
   */
  queryDescription(system: PublicKey): Promise<string | null> {
    return this.queryManager.queryDescription(system);
  }

  /**
   * Queries the avatar for a given system.
   *
   * @param system - The system to query the avatar for.
   * @returns The avatar for the system, or null if not found.
   */
  queryAvatar(system: PublicKey): Promise<ImageManifest | null> {
    return this.queryManager.queryAvatar(system);
  }

  /**
   * Queries the banner for a given system.
   *
   * @param system - The system to query the banner for.
   * @returns The banner for the system, or null if not found.
   */
  queryBanner(system: PublicKey): Promise<ImageManifest | null> {
    return this.queryManager.queryBanner(system);
  }

  /**
   * Queries the follows for a given system.
   *
   * @param system - The system to query the follows for.
   * @returns The follows for the system.
   */
  queryFollows(system: PublicKey): PublicKey[] {
    return this.queryManager.queryFollows(system);
  }

  /**
   * Queries the blocks for a given system.
   *
   * @param system - The system to query the blocks for.
   * @returns The blocks for the system.
   */
  queryBlocks(system: PublicKey): PublicKey[] {
    return this.queryManager.queryBlocks(system);
  }

  /**
   * Queries the servers for a given system.
   *
   * @param system - The system to query the servers for.
   * @returns The servers for the system.
   */
  queryServers(system: PublicKey): string[] {
    return this.queryManager.queryServers(system);
  }

  /**
   * Queries the authorities for a given system.
   *
   * @param system - The system to query the authorities for.
   * @returns The authorities for the system.
   */
  queryAuthorities(system: PublicKey): string[] {
    return this.queryManager.queryAuthorities(system);
  }

  /**
   * Queries the topics for a given system.
   *
   * @param system - The system to query the topics for.
   * @returns The topics for the system.
   */
  queryTopics(system: PublicKey): string[] {
    return this.queryManager.queryTopics(system);
  }

  /**
   * Returns the pointer to a given event
   */
  eventPointer(event: ProtobufEvent): Pointer {
    return this.queryManager.eventPointer(event);
  }

  /**
   * Returns the event key for a given event
   */
  eventKey(event: ProtobufEvent): EventKey {
    return this.queryManager.eventKey(event);
  }

  /**
   * Creates a new claim for the current identity.
   *
   * @param claimType - The type of claim.
   * @param fields - The fields of the claim.
   * @returns The resulting signed event.
   */
  async createClaim(
    claimType: bigint,
    fields: ClaimFieldEntry[],
  ): Promise<SignedEvent> {
    return this.claimManager.createClaim(claimType, fields);
  }

  /**
   * Verifies a claim for the current identity.
   *
   * @param targetPointer - The pointer to the claim to verify.
   * @returns The resulting signed event.
   */
  async createVerifyClaim(targetPointer: Pointer): Promise<SignedEvent> {
    return this.claimManager.createVerifyClaim(targetPointer);
  }

  /**
   * Creates a new post for the current identity.
   *
   * @param content - The user supplied text content.
   * @param image - Images to be displayed with the post supplied by the user.
   * @param reference - A reference to the parent post if this is a reply.
   * @returns The resulting signed event.
   */
  async createPost(
    content: string,
    image?: ImageManifest,
    reference?: Reference,
  ): Promise<SignedEvent> {
    return this.contentManager.createPost(content, image, reference);
  }

  /**
   * Creates a new like for the current identity.
   *
   * @param subjectPointer - The pointer to the subject to like.
   * @returns The resulting signed event.
   */
  async createLike(subjectPointer: Pointer): Promise<SignedEvent> {
    return this.contentManager.createLike(subjectPointer);
  }

  /**
   * Creates a new dislike for the current identity.
   *
   * @param subjectPointer - The pointer to the subject to dislike.
   * @returns The resulting signed event.
   */
  async createDislike(subjectPointer: Pointer): Promise<SignedEvent> {
    return this.contentManager.createDislike(subjectPointer);
  }

  /**
   * Creates a new neutral for the current identity.
   *
   * @param subjectPointer - The pointer to the subject to be neutral.
   * @returns The resulting signed event.
   */
  async createNeutral(subjectPointer: Pointer): Promise<SignedEvent> {
    return this.contentManager.createNeutral(subjectPointer);
  }

  /**
   * Sets the username for the current identity.
   *
   * @param username - A user supplied username.
   * @returns The resulting signed event.
   */
  async createUsername(username: string): Promise<SignedEvent> {
    return this.contentManager.createUsername(username);
  }

  /**
   * Sets the description for the current identity.
   *
   * @param description - A user supplied description.
   * @returns The resulting signed event.
   */
  async createDescription(description: string): Promise<SignedEvent> {
    return this.contentManager.createDescription(description);
  }

  /**
   * Sets the avatar for the current identity.
   *
   * @param avatar - A user supplied avatar image.
   * @returns The resulting signed event.
   */
  async createAvatar(avatar: ImageManifest): Promise<SignedEvent> {
    return this.contentManager.createAvatar(avatar);
  }

  /**
   * Sets the banner for the current identity.
   *
   * @param banner - A user supplied banner image.
   * @returns The resulting signed event.
   */
  async createBanner(banner: ImageManifest): Promise<SignedEvent> {
    return this.contentManager.createBanner(banner);
  }

  /**
   * Follow another identity.
   *
   * @param system - The system to follow.
   * @returns The resulting signed event.
   */
  async createFollow(system: PublicKey): Promise<SignedEvent> {
    return this.contentManager.createFollow(system);
  }

  /**
   * Unfollows another identity.
   *
   * @param system - The system to unfollow.
   * @returns The resulting signed event.
   */
  async createUnfollow(system: PublicKey): Promise<SignedEvent> {
    return this.contentManager.createUnfollow(system);
  }

  /**
   * Blocks another identity.
   *
   * @param system - The system to block.
   * @returns The resulting signed event.
   */
  async createBlock(system: PublicKey): Promise<SignedEvent> {
    return this.contentManager.createBlock(system);
  }

  /**
   * Unblocks another identity.
   *
   * @param system - The system to unblock.
   * @returns The resulting signed event.
   */
  async createUnblock(system: PublicKey): Promise<SignedEvent> {
    return this.contentManager.createUnblock(system);
  }

  /**
   * Adds a server to the current identity's server list.
   *
   * @param server - The server to add.
   * @returns The resulting signed event.
   */
  async createAddServer(server: string): Promise<SignedEvent> {
    return this.contentManager.createAddServer(server);
  }

  async addServer(server: string): Promise<SignedEvent> {
    return this.createAddServer(server);
  }

  /**
   * Removes a server from the current identity's server list.
   *
   * @param server - The server to remove.
   * @returns The resulting signed event.
   */
  async createRemoveServer(server: string): Promise<SignedEvent> {
    return this.contentManager.createRemoveServer(server);
  }

  async removeServer(server: string): Promise<SignedEvent> {
    return this.createRemoveServer(server);
  }

  /**
   * Adds an authority to the current identity's authority list.
   *
   * @param authority - The authority to add.
   * @returns The resulting signed event.
   */
  async createAddAuthority(authority: string): Promise<SignedEvent> {
    return this.contentManager.createAddAuthority(authority);
  }

  /**
   * Removes an authority from the current identity's authority list.
   *
   * @param authority - The authority to remove.
   * @returns The resulting signed event.
   */
  async createRemoveAuthority(authority: string): Promise<SignedEvent> {
    return this.contentManager.createRemoveAuthority(authority);
  }

  /**
   * Joins a topic for the current identity.
   *
   * @param topic - The topic to join.
   * @returns The resulting signed event.
   */
  async createJoinTopic(topic: string): Promise<SignedEvent> {
    return this.contentManager.createJoinTopic(topic);
  }
  /**
   * Leaves a topic for the current identity.
   *
   * @param topic - The topic to leave.
   * @returns The resulting signed event.
   */
  async createLeaveTopic(topic: string): Promise<SignedEvent> {
    return this.contentManager.createLeaveTopic(topic);
  }

  /**
   * Deletes a post for the current identity.
   *
   * @param postPointer - The pointer to the post to delete.
   * @returns The resulting signed event.
   */
  async deletePost(postPointer: Pointer): Promise<SignedEvent> {
    return this.contentManager.deletePost(postPointer);
  }

  public setCurrentKeyPair(keyPair: KeyPair, ephemeral: boolean = false) {
    this._currentKeyPair = keyPair;
    this._identityIsEphemeral = ephemeral;
  }

  private setState(state: ClientState) {
    this._state = state;
    this.events.emitStateChanged(state);
  }

  private setStep(step: InitializationStep) {
    this._step = step;
    this.events.emitProgress(step);
  }

  private setHydrationStatus(status: HydrationStatus) {
    this._hydrationStatus = status;
    this.events.emitHydrationStatus(status);
  }

  private setError(error: Error) {
    this._state = ClientState.ERROR;
    this._error = error;
    this.events.emitStateChanged(this._state);
    this.events.emitError(error);
  }

  get currentIdentity(): Identity {
    return {
      keyPair: this.currentKeyPair,
      process: this.process,
    };
  }

  get currentKeyPair(): KeyPair {
    if (!this._currentKeyPair) {
      throw new Error('Key pair not initialized');
    }
    return this._currentKeyPair;
  }

  get currentIdentityIsEphemeral(): boolean {
    return this._identityIsEphemeral;
  }

  get currentSystem(): PublicKey {
    return this.currentIdentity.keyPair.publicKey;
  }

  get core(): IPolycentricCore {
    if (!this._core) {
      throw new Error('Core runtime not initialized');
    }
    return this._core;
  }

  get crypto(): ICryptoManager {
    if (!this._cryptoManager) {
      throw new Error('Crypto manager not initialized');
    }
    return this._cryptoManager;
  }

  get storage(): StorageHandle {
    if (!this._storageHandle) {
      throw new Error('Storage handle not initialized');
    }
    return this._storageHandle;
  }

  get process(): Process {
    if (!this._process) {
      throw new Error('Process ID not initialized');
    }
    return this._process;
  }

  get state(): ClientState {
    return this._state;
  }

  get hydrationStatus(): HydrationStatus {
    return this._hydrationStatus;
  }

  get isReady(): boolean {
    return this._state === ClientState.READY;
  }

  get step(): string {
    return this._step;
  }

  get error(): Error | null {
    return this._error;
  }
}

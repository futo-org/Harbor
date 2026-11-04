/**
 * The Harbor client for JavaScript: rs-core's `HarborClient`, wherever it
 * runs (see `harbor.ts`), with defaults and JavaScript errors.
 *
 * Every operation is asynchronous. The only synchronous members read the
 * snapshot rs-core pushes whenever what a UI renders changes (`snapshot`
 * and the getters derived from it); `subscribe` makes that a store for
 * `useSyncExternalStore`.
 */
import {
  type Blob,
  bindings,
  type ClientEvent,
  type ClientSnapshot,
  type Content,
  type ContentDigest,
  type EventBundle,
  type EventKey,
  type GetServerInfoResponse,
  type IdentityState,
  type LegacyEvent,
  type LegacyLogin,
  type ListEventsArgs,
  type LoginId,
  type LoginKind,
  type LoginOverview,
  type LoginStatus,
  type PairingInfo,
  type PairingSession,
  type PublicKey,
  type PublishArgs,
  type Query,
  type QueryData,
  type QueryOpts,
  type RegisterPushNotificationRequest,
  type ReportStatus,
  type ServerPushResult,
  type SyncStrategy,
  toBuffer,
  type UrlInfoResponse,
  type BackupCheck,
} from './bindings';
import { COLLECTION, type Collection } from './constants';
import { wrapError } from './errors';
import type { AsyncHarbor, PendingEventRef, QueryStream } from './harbor';

type Events = {
  committed: EventBundle;
  pulled: string;
  pushResults: ServerPushResult[];
};

export class PolycentricClient {
  private current: ClientSnapshot;
  private readonly stateListeners = new Set<() => void>();
  private readonly eventListeners: {
    [K in keyof Events]: Set<(value: Events[K]) => void>;
  } = { committed: new Set(), pulled: new Set(), pushResults: new Set() };
  private readonly stopWatching: () => void;

  private constructor(
    /** The underlying client, for calls this class doesn't cover. */
    readonly harbor: AsyncHarbor,
    snapshot: ClientSnapshot,
  ) {
    this.current = snapshot;
    this.stopWatching = harbor.watch((event) => this.onEvent(event));
  }

  /** Wrap a client, starting from its current snapshot. */
  static async open(harbor: AsyncHarbor): Promise<PolycentricClient> {
    return new PolycentricClient(harbor, await harbor.snapshot());
  }

  /** Stop receiving events. The client itself keeps running. */
  close(): void {
    this.stopWatching();
  }

  private onEvent(event: ClientEvent): void {
    const tags = bindings().ClientEvent_Tags;
    switch (event.tag) {
      case tags.Snapshot:
        this.current = event.inner.snapshot;
        for (const listener of this.stateListeners) listener();
        break;
      case tags.Committed:
        for (const l of this.eventListeners.committed) l(event.inner.bundle);
        break;
      case tags.Pulled:
        for (const l of this.eventListeners.pulled) l(event.inner.identity);
        break;
      case tags.PushResults:
        for (const l of this.eventListeners.pushResults) {
          l(event.inner.results);
        }
        break;
    }
  }

  // ── Snapshot ──────────────────────────────────────────────────────

  /** What a UI renders, as rs-core last reported it. */
  get snapshot(): ClientSnapshot {
    return this.current;
  }

  /** Call `onChange` whenever `snapshot` changes. */
  subscribe(onChange: () => void): () => void {
    this.stateListeners.add(onChange);
    return () => this.stateListeners.delete(onChange);
  }

  get activeLogin(): LoginOverview | null {
    return this.current.login ?? null;
  }

  get activeIdentityKey(): string | null {
    return this.current.login?.id.identity ?? null;
  }

  /** The signed-in key. */
  get activePublicKey(): PublicKey | null {
    return this.current.login?.id.publicKey ?? null;
  }

  get servers(): string[] {
    return this.current.servers;
  }

  /** False when storage won't survive a restart. */
  get persistentStorage(): boolean {
    return this.current.persistent;
  }

  /** Listen for `committed` (an event of ours was stored), `pulled`
   * (events for an identity arrived) or `pushResults`. */
  on<K extends keyof Events>(
    event: K,
    listener: (value: Events[K]) => void,
  ): () => void {
    const listeners = this.eventListeners[event] as Set<
      (value: Events[K]) => void
    >;
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  // ── Publishing ────────────────────────────────────────────────────

  /** Publish `content` as the signed-in login. */
  publish(
    content: Content,
    collection: Collection | number = COLLECTION.FEED,
  ): Promise<EventBundle> {
    return wrapError(() => this.harbor.publish(content, collection));
  }

  /**
   * Sign `content` without storing it, e.g. to show it before it's
   * committed. Commit it with `commitEvent`.
   */
  prepareEvent(
    content: Content,
    collection: Collection | number = COLLECTION.FEED,
  ): Promise<PendingEventRef> {
    return wrapError(() => this.harbor.prepareEvent(content, collection));
  }

  /** Store a prepared event. Rejects with `AlreadyExistsError` if its
   * sequence was taken since; prepare it again then. */
  commitEvent(event: PendingEventRef): Promise<EventBundle> {
    return wrapError(() => this.harbor.commitEvent(event));
  }

  // ── Local reads ───────────────────────────────────────────────────

  /** The latest known state of `identity` (default: the signed-in one). */
  async resolveIdentity(identity?: string): Promise<IdentityState | null> {
    return (
      (await wrapError(() => this.harbor.resolveIdentity(identity))) ?? null
    );
  }

  /** The identity chain of `identity`, oldest first. */
  resolveIdentityChain(identity: string): Promise<EventBundle[]> {
    return wrapError(() => this.harbor.resolveIdentityChain(identity));
  }

  /** Non-deleted events of one stream, from what's held locally. */
  listValidEvents(
    identity: string,
    collection: number,
  ): Promise<EventBundle[]> {
    return wrapError(() => this.harbor.listValidEvents(identity, collection));
  }

  /** Identities the signed-in identity blocks. */
  blockedIdentities(): Promise<string[]> {
    return wrapError(() => this.harbor.blockedIdentities());
  }

  // ── Queries ───────────────────────────────────────────────────────

  /** Run `query` across the servers; `queryKey` shares a cached result
   * between subscribers. */
  fetchQuery(
    queryKey: string[] | undefined,
    query: Query,
    opts?: QueryOpts,
  ): QueryStream {
    return this.harbor.query(queryKey, query, opts);
  }

  /** The first successful result of `query`. */
  async awaitQuery(
    query: Query,
    options: { queryKey?: string[]; opts?: QueryOpts } = {},
  ): Promise<QueryData | null> {
    return (
      (await wrapError(() =>
        this.harbor.awaitQuery(query, options.queryKey, options.opts),
      )) ?? null
    );
  }

  /** One-shot ListEvents across the servers; results also land in the
   * engine. */
  listEvents(
    args: ListEventsArgs,
    options: { queryKey?: string[]; opts?: QueryOpts } = {},
  ): Promise<EventBundle[]> {
    return wrapError(() =>
      this.harbor.listEvents(args, options.queryKey, options.opts),
    );
  }

  /** Clear the cached results under `queryKey`. */
  invalidateQuery(queryKey: string[]): Promise<void> {
    return wrapError(() => this.harbor.invalidateQuery(queryKey));
  }

  invalidateAllQueries(): Promise<void> {
    return wrapError(() => this.harbor.invalidateAllQueries());
  }

  // ── Sync ──────────────────────────────────────────────────────────

  /** Pull and/or push; resolves with the number of events pulled. */
  sync(strategy?: SyncStrategy): Promise<number> {
    return wrapError(() =>
      this.harbor.sync(strategy ?? bindings().SyncStrategy.Full),
    );
  }

  startLiveSync(): Promise<void> {
    return wrapError(() => this.harbor.startLiveSync());
  }

  stopLiveSync(): Promise<void> {
    return wrapError(() => this.harbor.stopLiveSync());
  }

  // ── Blobs ─────────────────────────────────────────────────────────

  /** Store blob bytes; returns the `Blob` to reference from content. It's
   * uploaded with the content. */
  commitBlob(bytes: Uint8Array | ArrayBuffer, mimeType: string): Promise<Blob> {
    return wrapError(() => this.harbor.commitBlob(toBuffer(bytes), mimeType));
  }

  /** The blob's bytes from local storage. */
  async getBlob(digest: ContentDigest): Promise<ArrayBuffer | null> {
    return (await wrapError(() => this.harbor.getBlob(digest))) ?? null;
  }

  /** The blob's bytes, locally or from the servers. */
  async fetchBlob(digest: ContentDigest): Promise<ArrayBuffer | null> {
    return (await wrapError(() => this.harbor.fetchBlob(digest))) ?? null;
  }

  hasBlob(digest: ContentDigest): Promise<boolean> {
    return wrapError(() => this.harbor.hasBlob(digest));
  }

  deleteBlob(digest: ContentDigest): Promise<boolean> {
    return wrapError(() => this.harbor.deleteBlob(digest));
  }

  /** Upload a blob's body to `servers` (default: all). */
  uploadBlob(
    blob: Blob,
    body: Uint8Array | ArrayBuffer,
    servers?: string[],
  ): Promise<void> {
    return wrapError(() =>
      this.harbor.uploadBlob(blob, toBuffer(body), servers),
    );
  }

  /** Where the servers serve a blob, best first. */
  blobUrls(digest: ContentDigest): string[] {
    return bindings().blobUrls(this.current.servers, digest);
  }

  blobUrl(digest: ContentDigest): string | null {
    return this.blobUrls(digest)[0] ?? null;
  }

  /** `imageUrl` through the servers' image proxies, best first. */
  imageProxyUrls(imageUrl: string): string[] {
    return bindings().imageProxyUrls(this.current.servers, imageUrl);
  }

  imageProxyUrl(imageUrl: string): string | null {
    return this.imageProxyUrls(imageUrl)[0] ?? null;
  }

  // ── Logins ────────────────────────────────────────────────────────

  listLogins(identity?: string): Promise<LoginOverview[]> {
    return wrapError(() => this.harbor.listLogins(identity));
  }

  /** Sign in as `login` (remembered for next time), or out with `null`. */
  loginAs(login: LoginId | null, persist = true): Promise<void> {
    return wrapError(() => this.harbor.loginAs(login ?? undefined, persist));
  }

  changeLoginStatus(id: LoginId, status: LoginStatus): Promise<void> {
    return wrapError(() => this.harbor.changeLoginStatus(id, status));
  }

  deleteLogin(id: LoginId): Promise<void> {
    return wrapError(() => this.harbor.deleteLogin(id));
  }

  /** Create and publish a new identity and sign in as it, adding
   * `server` to the server list first if given. */
  createIdentity(server?: string): Promise<LoginId> {
    return wrapError(() => this.harbor.createIdentity(server));
  }

  /** Generate and store a key to pair (or recover) into `identity`. */
  beginLogin(identity: string, kind: LoginKind): Promise<LoginOverview> {
    return wrapError(() => this.harbor.beginLogin(identity, kind));
  }

  /** Claim an identity that authorized a pending login's key, then sign
   * in as it. */
  claim(login: LoginId, servers?: string[]): Promise<IdentityState> {
    return wrapError(() => this.harbor.claim(login, servers));
  }

  // ── Backups ───────────────────────────────────────────────────────

  /** Rotate the recovery key and return a backup of the signed-in
   * identity as text. Older backups stop working. */
  createBackup(): Promise<string> {
    return wrapError(() => this.harbor.createBackup());
  }

  /** Whether `backup` can restore `identity` (default: the signed-in one). */
  checkBackup(backup: string, identity?: string): Promise<BackupCheck> {
    return wrapError(() => this.harbor.checkBackup(backup, identity));
  }

  /** Restore the identity `backup` is for and sign in as it. */
  recoverFromBackup(backup: string): Promise<LoginId> {
    return wrapError(() => this.harbor.recoverFromBackup(backup));
  }

  // ── Identity ──────────────────────────────────────────────────────

  publishIdentityUpdate(args: PublishArgs): Promise<EventKey> {
    return wrapError(() => this.harbor.publishIdentityUpdate(args));
  }

  addSigningKey(key: PublicKey): Promise<EventKey> {
    return wrapError(() => this.harbor.addSigningKey(key));
  }

  removeSigningKey(key: PublicKey): Promise<EventKey> {
    return wrapError(() => this.harbor.removeSigningKey(key));
  }

  addRotationKey(key: PublicKey): Promise<EventKey> {
    return wrapError(() => this.harbor.addRotationKey(key));
  }

  removeRotationKey(key: PublicKey): Promise<EventKey> {
    return wrapError(() => this.harbor.removeRotationKey(key));
  }

  /** Add `url` to the signed-in identity's servers. Rejects with
   * `ServerAlreadyAddedError` if it's there. */
  addServer(url: string): Promise<EventKey> {
    return wrapError(() => this.harbor.addServer(url));
  }

  removeServer(url: string): Promise<EventKey> {
    return wrapError(() => this.harbor.removeServer(url));
  }

  /** Use `servers` until the signed-in identity names its own. */
  setServers(servers: string[]): Promise<void> {
    return wrapError(() => this.harbor.setServers(servers));
  }

  // ── Pairing ───────────────────────────────────────────────────────

  /** Issuer: start a pairing session on `server`. */
  createPairingSession(server: string): Promise<PairingSession> {
    return wrapError(() => this.harbor.createPairingSession(server));
  }

  /** Issuer: publish the session's next state (after authorizing). */
  updatePairingSession(
    info: PairingInfo,
    sequence: bigint,
  ): Promise<PairingSession> {
    return wrapError(() => this.harbor.updatePairingSession(info, sequence));
  }

  getPairingSession(info: PairingInfo): Promise<PairingSession> {
    return wrapError(() => this.harbor.getPairingSession(info));
  }

  /** Claimer: ask to pair a pending login's key. */
  joinPairingSession(info: PairingInfo, login: LoginId): Promise<void> {
    return wrapError(() => this.harbor.joinPairingSession(info, login));
  }

  /** Issuer: the keys asking to be paired. */
  pollForClaimers(info: PairingInfo): Promise<PublicKey[]> {
    return wrapError(() => this.harbor.pollForClaimers(info));
  }

  /** Claimer: whether the issuer authorized the pending login's key. */
  pollForAuthorization(info: PairingInfo, login: LoginId): Promise<boolean> {
    return wrapError(() => this.harbor.pollForAuthorization(info, login));
  }

  // ── Servers ───────────────────────────────────────────────────────

  async urlInfo(url: string): Promise<UrlInfoResponse | null> {
    return (await wrapError(() => this.harbor.urlInfo(url))) ?? null;
  }

  serverInfo(server: string): Promise<GetServerInfoResponse> {
    return wrapError(() => this.harbor.serverInfo(server));
  }

  /** A JWT authenticating the signed-in identity to `audience`. */
  createServerJwt(audience: string): Promise<string> {
    return wrapError(() => this.harbor.createServerJwt(audience));
  }

  setBanStatus(
    server: string,
    targetIdentity: string,
    banned: boolean,
  ): Promise<void> {
    return wrapError(() =>
      this.harbor.setBanStatus(server, targetIdentity, banned),
    );
  }

  resolveReport(
    server: string,
    reportId: bigint,
    status: ReportStatus,
  ): Promise<void> {
    return wrapError(() => this.harbor.resolveReport(server, reportId, status));
  }

  deleteContent(server: string, target: EventKey): Promise<void> {
    return wrapError(() => this.harbor.deleteContent(server, target));
  }

  acknowledgeNotifications(lastSeen: EventKey): Promise<void> {
    return wrapError(() => this.harbor.acknowledgeNotifications(lastSeen));
  }

  registerPushNotifications(
    servers: string[],
    request: RegisterPushNotificationRequest,
  ): Promise<void> {
    return wrapError(() =>
      this.harbor.registerPushNotifications(servers, request),
    );
  }

  // ── Migration ─────────────────────────────────────────────────────

  /**
   * Bring data from an older store into storage: signed events exactly as
   * stored (each must verify), serialized content exactly as stored, and
   * logins. Anything already stored is skipped.
   */
  importLegacyData(data: {
    events: LegacyEvent[];
    contents: ArrayBuffer[];
    logins: LegacyLogin[];
    active?: LoginId;
  }): Promise<void> {
    return wrapError(() =>
      this.harbor.importLegacyData(
        data.events,
        data.contents,
        data.logins,
        data.active,
      ),
    );
  }
}

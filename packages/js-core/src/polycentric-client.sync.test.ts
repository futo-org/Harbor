import { describe, expect, it, vi } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { QueryStatus } from '@polycentric/rs-core-uniffi-web/generated';
import { PolycentricClient } from './polycentric-client';
import { StorageHandle } from './datastore/storage-handle';
import { COLLECTION, SyncStrategy } from './constants';
import { bytesToHex, toDigestKey } from './utils/hex';
import * as Proto from './proto/v2';
import type {
  IContentRepository,
  IEventRepository,
  IFileStoreDriver,
} from './platform-interfaces';

// ---------------------------------------------------------------------------
// Deterministic data helpers
// ---------------------------------------------------------------------------

/**
 * A keypair used to sign events (rotation key or signing key).
 * Holds the raw private key (for producing signatures) and the matching
 * public key.
 */
interface Signer {
  privateKey: Uint8Array;
  publicKey: Proto.PublicKey;
}

/** An ed25519 keypair for rotation or signing keys. */
function makeSigner(seed: number): Signer {
  const privateKey = new Uint8Array(32).fill(seed);
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKey,
    publicKey: Proto.PublicKey.create({
      keyType: Proto.KeyType.ED25519,
      key: publicKey,
    }),
  };
}

/**
 * An identity and the identity-collection data that backs it.
 * `identityEvents` / `identityContents` are seeded into the repositories so
 * validity checks can resolve the identity's authorized keys.
 */
interface TestIdentity {
  key: string;
  rotationKeys: Signer[];
  signingKeys: Signer[];
  identityEvents: Proto.SignedEvent[];
  identityContents: { digest: Proto.ContentDigest; content: Proto.Content }[];
}

/**
 * Build an identity whose key is derived exactly as `IdentityManager.publish()`
 * does: the hex sha256 of the serialized initial Identity document.
 * All authorized keys live in that single initial document (signed by the first
 * rotation key) — a valid identity state that avoids a long event stream.
 */
function makeIdentity(
  rotationKeys: Signer[],
  signingKeys: Signer[] = [],
): TestIdentity {
  const initialDoc = Proto.Identity.create({
    rotationKeys: rotationKeys.map((s) => s.publicKey),
    signingKeys: signingKeys.map((s) => s.publicKey),
  });
  const key = bytesToHex(sha256(Proto.Identity.toBinary(initialDoc)), 32);

  const content = Proto.Content.create({
    contentBody: { oneofKind: 'identity', identity: initialDoc },
  });
  const event = makeSignedEvent({
    signer: rotationKeys[0],
    identity: key,
    collection: COLLECTION.IDENTITY,
    sequence: 1,
    identitySequence: 1,
    content,
  });

  return {
    key,
    rotationKeys,
    signingKeys,
    identityEvents: [event],
    identityContents: [{ digest: buildDigest(content), content }],
  };
}

/** A Blob proto whose digest is the sha256 of `bytes`. */
function makeBlob(bytes: Uint8Array, mimeType = 'image/png'): Proto.Blob {
  return Proto.Blob.create({
    digest: Proto.ContentDigest.create({
      type: Proto.ContentDigestType.SHA256,
      value: sha256(bytes),
    }),
    mimeType,
    size: BigInt(bytes.length),
  });
}

/** A post Content, optionally referencing blobs via a single ImageSet. */
function makeContent(text: string, blobs: Proto.Blob[] = []): Proto.Content {
  const images =
    blobs.length > 0
      ? [Proto.ImageSet.create({ images: blobs.map((blob) => ({ blob })) })]
      : [];
  return Proto.Content.create({
    contentBody: {
      oneofKind: 'post',
      post: Proto.Post.create({ text, images }),
    },
  });
}

const buildDigest = (content: Proto.Content): Proto.ContentDigest =>
  Proto.ContentDigest.create({
    type: Proto.ContentDigestType.SHA256,
    value: sha256(Proto.Content.toBinary(content)),
  });

interface MakeEventArgs {
  signer: Signer;
  identity: string | TestIdentity;
  collection: number;
  sequence: bigint | number;
  content: Proto.Content;
  identitySequence?: bigint | number;
  createdAt?: bigint | number;
}

/** Accept either an identity key or a `TestIdentity` and return the key. */
const identityKeyOf = (identity: string | TestIdentity): string =>
  typeof identity === 'string' ? identity : identity.key;

/**
 * A signed v2 event.
 * The signature covers the serialized Event bytes.
 */
function makeSignedEvent(args: MakeEventArgs): Proto.SignedEvent {
  const event = Proto.Event.create({
    key: Proto.EventKey.create({
      collection: args.collection,
      identity: identityKeyOf(args.identity),
      signedBy: args.signer.publicKey,
      sequence: BigInt(args.sequence),
    }),
    identitySequence: BigInt(args.identitySequence ?? 1),
    previousSignature: new Uint8Array(),
    previousRoot: new Uint8Array(),
    contentDigest: buildDigest(args.content),
    createdAt: BigInt(args.createdAt ?? 1_700_000_000_000),
  });
  const eventBytes = Proto.Event.toBinary(event);
  const signature = ed25519.sign(eventBytes, args.signer.privateKey);
  return Proto.SignedEvent.create({ signature, eventBytes });
}

/**
 * A contiguous run of events (sequences 1..count) for a single
 * (identity, signer, collection) stream.
 * The store never has gaps, so the head of a stream is always its highest
 * sequence.
 */
function makeStream(args: {
  signer: Signer;
  identity: string | TestIdentity;
  collection: number;
  count: number;
  label: string;
}): Proto.SignedEvent[] {
  const out: Proto.SignedEvent[] = [];
  for (let sequence = 1; sequence <= args.count; sequence++) {
    out.push(
      makeSignedEvent({
        signer: args.signer,
        identity: args.identity,
        collection: args.collection,
        sequence,
        content: makeContent(`${args.label}-${sequence}`),
      }),
    );
  }
  return out;
}

function makeBundle(
  signedEvent: Proto.SignedEvent,
  content?: Proto.Content,
): Proto.EventBundle {
  return Proto.EventBundle.create({
    signedEvent,
    serializedContent: content
      ? Proto.SerializedContent.create({
          contentBytes: Proto.Content.toBinary(content),
        })
      : undefined,
    eventProofs: [],
  });
}

function putEventsResponse(opts: {
  requestedBlobs?: Proto.Blob[];
  errors?: Proto.PutEventError[];
}): ArrayBuffer {
  return Proto.PutEventsResponse.toBinary(
    Proto.PutEventsResponse.create({
      requestedBlobs: opts.requestedBlobs ?? [],
      errors: opts.errors ?? [],
    }),
  ).buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

/** Canonical string identity of an EventKey, used as the store's map key. */
const eventKeyString = (key: Proto.EventKey): string =>
  `${key.collection}|${key.identity}|${
    key.signedBy
      ? `${key.signedBy.keyType}:${bytesToHex(key.signedBy.key)}`
      : '?'
  }|${key.sequence}`;

/**
 * In-memory mock of `IEventRepository` backed by a `Map` keyed by EventKey.
 * Lets tests assert that pushes/pulls read and write the correct events, and
 * that streams are correctly segmented by (identity, signer, collection) so a
 * regression that mixes up identities or signers is detectable.
 * `saved` records the events written via `save()` (seeded events are inserted
 * without being recorded) so tests can distinguish newly persisted events from
 * pre-existing.
 */
class FakeEventRepository implements IEventRepository {
  readonly map = new Map<string, Proto.SignedEvent>();
  readonly saved: Proto.SignedEvent[] = [];

  constructor(events: Proto.SignedEvent[] = []) {
    for (const e of events) this.insert(e);
  }

  /** Insert without recording as a save (for seeding the store). */
  private insert(signedEvent: Proto.SignedEvent): void {
    const event = Proto.Event.fromBinary(signedEvent.eventBytes);
    this.map.set(eventKeyString(event.key!), signedEvent);
  }

  async save(
    signedEvents: Proto.SignedEvent | Proto.SignedEvent[],
  ): Promise<void> {
    const list = Array.isArray(signedEvents) ? signedEvents : [signedEvents];
    for (const e of list) {
      this.saved.push(e);
      this.insert(e);
    }
  }

  async getAll(): Promise<Proto.SignedEvent[]> {
    return [...this.map.values()];
  }

  async getBatch(): Promise<{ events: Proto.SignedEvent[]; offset: number }> {
    return { events: await this.getAll(), offset: 0 };
  }

  async getByEventKey(key: Proto.EventKey): Promise<Proto.SignedEvent | null> {
    return this.map.get(eventKeyString(key)) ?? null;
  }

  async getByIdentity(
    identity: string,
    options?: {
      signer?: Proto.PublicKey;
      collection?: number;
      headsOnly?: boolean;
    },
  ): Promise<Proto.SignedEvent[]> {
    let events = [...this.map.values()]
      .map((se) => ({ se, event: Proto.Event.fromBinary(se.eventBytes) }))
      .filter(({ event }) => event.key!.identity === identity);

    if (options?.signer) {
      const wanted = bytesToHex(options.signer.key);
      events = events.filter(
        ({ event }) => bytesToHex(event.key!.signedBy!.key) === wanted,
      );
    }
    if (options?.collection != null) {
      events = events.filter(
        ({ event }) => event.key!.collection === options.collection,
      );
    }

    if (options?.headsOnly) {
      // One head (max sequence) per (collection, signer) stream.
      const heads = new Map<string, { se: Proto.SignedEvent; seq: bigint }>();
      for (const { se, event } of events) {
        const stream = `${event.key!.collection}|${bytesToHex(
          event.key!.signedBy!.key,
        )}`;
        const seq = event.key!.sequence;
        const cur = heads.get(stream);
        if (!cur || seq > cur.seq) heads.set(stream, { se, seq });
      }
      return [...heads.values()].map((h) => h.se);
    }

    return events.map(({ se }) => se);
  }
}

/**
 * In-memory mock of `IContentRepository` backed by a `Map` keyed by content
 * digest.
 * `saved` records writes so tests can assert content is (or isn't) persisted,
 * e.g. dedup by digest.
 */
class FakeContentRepository implements IContentRepository {
  readonly map = new Map<
    string,
    { digest: Proto.ContentDigest; content: Proto.Content }
  >();
  readonly saved: { digest: Proto.ContentDigest; content: Proto.Content }[] =
    [];

  constructor(
    contents: { digest: Proto.ContentDigest; content: Proto.Content }[] = [],
  ) {
    for (const c of contents) this.map.set(toDigestKey(c.digest), c);
  }

  async save(
    digest: Proto.ContentDigest,
    content: Proto.Content,
  ): Promise<void> {
    this.saved.push({ digest, content });
    this.map.set(toDigestKey(digest), { digest, content });
  }

  async get(digest: Proto.ContentDigest): Promise<Proto.Content | null> {
    return this.map.get(toDigestKey(digest))?.content ?? null;
  }

  async getAll(): Promise<
    { digest: Proto.ContentDigest; content: Proto.Content }[]
  > {
    return [...this.map.values()];
  }
}

/**
 * In-memory mock of `IFileStoreDriver` backed by a `Map` keyed by digest.
 * Blob bodies the client already has are pre-seeded.
 * `put` is a spy so tests can assert which blobs got fetched and stored during
 * a pull.
 */
class FakeFileStore implements IFileStoreDriver {
  readonly map = new Map<string, Uint8Array>();
  readonly put = vi.fn(
    async (digest: Proto.ContentDigest, bytes: Uint8Array) => {
      this.map.set(toDigestKey(digest), bytes);
    },
  );

  constructor(
    entries: { digest: Proto.ContentDigest; bytes: Uint8Array }[] = [],
  ) {
    for (const e of entries) this.map.set(toDigestKey(e.digest), e.bytes);
  }

  async has(digest: Proto.ContentDigest): Promise<boolean> {
    return this.map.has(toDigestKey(digest));
  }

  async get(digest: Proto.ContentDigest): Promise<Uint8Array | null> {
    return this.map.get(toDigestKey(digest)) ?? null;
  }

  async delete(digest: Proto.ContentDigest): Promise<void> {
    this.map.delete(toDigestKey(digest));
  }
}

/**
 * Per-server behavior for the mocked `fetchQuery` / `pushLocalEvents`.
 * `listEvents` resolves on the QueryStatus.Success emission.
 * The callbacks in the client reference `subscription` before it is assigned,
 * so we must emit asynchronously (via queueMicrotask).
 */
interface CoreMockOptions {
  /** Returns the bundles a pull should yield, or throws to fail the query. */
  pullBundles?: (args: any) => Proto.EventBundle[];
  pullError?: string;
  /**
   * Per-server push response (ArrayBuffer) or undefined.
   * May reject.
   */
  pushResponse?: (
    identity: string,
    server: string,
    partial: boolean,
  ) => Promise<ArrayBuffer | undefined>;
}

/**
 * A stand-in for the `rs-core` instance (`PolycentricCoreLike`).
 * The sync code delegates pulls to `fetchQuery` and pushes to
 * `pushLocalEvents`.
 * Both are `vi.fn` spies driven by `CoreMockOptions`, so tests can supply pull
 * results / push responses and assert the arguments the client passes
 * (identity, server, partial flag, head filters).
 * All methods are spies, which also lets tests confirm a strategy never invokes
 * the other half.
 */
function makeCoreMock(opts: CoreMockOptions = {}) {
  const fetchQuery = vi.fn((_queryKey: unknown, query: any) => ({
    subscribe(observer: any) {
      queueMicrotask(() => {
        if (opts.pullError !== undefined) {
          observer.error(opts.pullError);
          return;
        }
        try {
          const bundles = opts.pullBundles
            ? opts.pullBundles(query?.inner?.[0])
            : [];
          const response = Proto.ListEventsResponse.create({
            eventBundles: bundles,
            eventHints: [],
          });
          observer.next({
            data: Proto.ListEventsResponse.toBinary(response).buffer,
            status: QueryStatus.Success,
          });
        } catch (e) {
          observer.error(String(e));
        }
      });
      return { unsubscribe: () => {}, isClosed: () => false };
    },
  }));

  const pushLocalEvents = vi.fn(
    (identity: string, server: string, partial: boolean) =>
      opts.pushResponse
        ? opts.pushResponse(identity, server, partial)
        : Promise.resolve(undefined),
  );

  return {
    fetchQuery,
    pushLocalEvents,
    copyEvents: vi.fn(),
    copyContents: vi.fn(),
    setServers: vi.fn(),
    setAuthTokenProvider: vi.fn(),
    clearAuthTokens: vi.fn(),
    uploadBlob: vi.fn(async () => {}),
  } as any;
}

/**
 * The `ListEventsArgs` the client passed to its Nth `fetchQuery` call
 * (default: the first).
 * `fetchQuery(queryKey, query, opts)` receives the query as arg 2, and
 * `Query.ListEvents` stores its record at `inner[0]`.
 */
function pullQueryArgs(core: any, callIndex = 0): any {
  return core.fetchQuery.mock.calls[callIndex][1].inner[0];
}

interface MakeClientArgs {
  core?: any;
  servers?: string[];
  /** The active identity. Its identity event/document are seeded too. */
  identity?: TestIdentity | null;
  /** Other identities present in the store (seeded but not made active). */
  otherIdentities?: TestIdentity[];
  signer?: Signer;
  events?: Proto.SignedEvent[];
  contents?: { digest: Proto.ContentDigest; content: Proto.Content }[];
  fileStore?: FakeFileStore;
}

/**
 * Build a `PolycentricClient` wired to the in-memory mocks and ready to sync.
 * The constructor does not run `initialize()`, so the fields that step would
 * normally populate (storage handle, server list, active identity, current key
 * pair) are set directly here, and the seeded events/content are loaded into
 * the fake repositories.
 * Returns the client alongside the mocks so tests can both drive behavior and
 * inspect what was read/written.
 */
function makeClient(args: MakeClientArgs = {}) {
  const core = args.core ?? makeCoreMock();

  // Seed each identity's identity event + document so validity checks can
  // resolve its authorized keys.
  const seededIdentities = [
    ...(args.identity ? [args.identity] : []),
    ...(args.otherIdentities ?? []),
  ];
  const eventRepository = new FakeEventRepository([
    ...seededIdentities.flatMap((i) => i.identityEvents),
    ...(args.events ?? []),
  ]);
  const contentRepository = new FakeContentRepository([
    ...seededIdentities.flatMap((i) => i.identityContents),
    ...(args.contents ?? []),
  ]);
  const fileStore = args.fileStore ?? new FakeFileStore();

  const cryptoManager = {
    sign: async (priv: Uint8Array, msg: Uint8Array) => ed25519.sign(msg, priv),
    verify: async (pub: Uint8Array, msg: Uint8Array, sig: Uint8Array) =>
      ed25519.verify(sig, msg, pub),
    toHex: (b: Uint8Array) => bytesToHex(b),
  } as any;

  const storageDriver = {
    saveActiveIdentityKey: vi.fn(async () => {}),
    loadActiveIdentityKey: vi.fn(async () => null),
  } as any;

  const client = new PolycentricClient({
    core,
    storageDriver,
    filestoreDriver: fileStore,
    cryptoManager,
  });

  (client as any).storageHandle = new StorageHandle({
    eventRepository,
    contentRepository,
    keysRepository: {} as any,
    eventAckRepository: {} as any,
  });
  client.servers = args.servers ?? ['http://server-1'];
  client.activeIdentityKey = args.identity ? args.identity.key : null;
  if (args.signer) {
    client.currentKeyPair = {
      keyType: Proto.KeyType.ED25519,
      privateKey: {
        keyType: Proto.KeyType.ED25519,
        key: args.signer.privateKey,
      },
      publicKey: args.signer.publicKey,
    };
  }

  return { client, core, eventRepository, contentRepository, fileStore };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const signerA = makeSigner(1);
const signerB = makeSigner(2);
const signerOther = makeSigner(9);
const identityA = makeIdentity([signerA], [signerB]); // signerA rotates, signerB signs
const identityB = makeIdentity([signerOther]);

describe('PolycentricClient sync', () => {
  describe('simple scope (one server, one identity, one signer)', () => {
    it('full pull persists new events + content and returns the new count', async () => {
      const content = makeContent('hello');
      const remote = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content,
      });
      const core = makeCoreMock({
        pullBundles: () => [makeBundle(remote, content)],
      });
      const { client, eventRepository, contentRepository } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      const count = await (client as any).pull(false);

      expect(count).toBe(1);
      // The exact event is persisted under its key.
      const event = Proto.Event.fromBinary(remote.eventBytes);
      expect(await eventRepository.getByEventKey(event.key!)).toEqual(remote);
      // The exact content is persisted under the event's content digest.
      expect(await contentRepository.get(event.contentDigest!)).toEqual(
        content,
      );
      // Full pull => no heads filter (empty heads array).
      expect(pullQueryArgs(core).heads).toEqual([]);
      expect(pullQueryArgs(core).identity).toBe(identityA.key);
    });

    it('partial pull sends the stored head as a filter', async () => {
      // Contiguous sequences 1..3; the head is the highest (3).
      const seeded = makeStream({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        count: 3,
        label: 'seeded',
      });
      const core = makeCoreMock({ pullBundles: () => [] });
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
        events: seeded,
      });

      await (client as any).pull(true);

      const heads = pullQueryArgs(core).heads;
      // The FEED stream head (seq 3) plus the seeded IDENTITY stream head (seq 1).
      expect(heads).toHaveLength(2);
      const byStream = new Map(
        heads.map((h) => [
          `${h.collection}|${bytesToHex(new Uint8Array(h.signedBy.key))}`,
          h,
        ]),
      );
      const sA = bytesToHex(signerA.publicKey.key);
      const feedHead = byStream.get(`${COLLECTION.FEED}|${sA}`);
      expect(feedHead.identity).toBe(identityA.key);
      expect(feedHead.sequence).toBe(3n);
      expect(byStream.get(`${COLLECTION.IDENTITY}|${sA}`).sequence).toBe(1n);
    });

    it('full push calls pushLocalEvents once with partial=false and pulls nothing', async () => {
      const core = makeCoreMock();
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      const count = await client.sync(SyncStrategy.FULL_PUSH);

      expect(count).toBe(0);
      expect(core.fetchQuery).not.toHaveBeenCalled();
      expect(core.pushLocalEvents).toHaveBeenCalledTimes(1);
      expect(core.pushLocalEvents).toHaveBeenCalledWith(
        identityA.key,
        'http://server-1',
        false,
      );
    });

    it('partial push calls pushLocalEvents with partial=true', async () => {
      const core = makeCoreMock();
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      await client.sync(SyncStrategy.PARTIAL_PUSH);

      expect(core.pushLocalEvents).toHaveBeenCalledWith(
        identityA.key,
        'http://server-1',
        true,
      );
    });

    it('trySaveContent dedups by digest', async () => {
      const content = makeContent('dup');
      const digest = buildDigest(content);
      const { client, contentRepository } = makeClient({
        identity: identityA,
        signer: signerA,
        contents: [{ digest, content }],
      });
      const event = Proto.Event.create({ contentDigest: digest });
      const bundle = makeBundle(
        makeSignedEvent({
          signer: signerA,
          identity: identityA,
          collection: COLLECTION.FEED,
          sequence: 1,
          content,
        }),
        content,
      );

      const blobs: Proto.Blob[] = [];
      const added = await (client as any).trySaveContent(event, bundle, blobs);

      expect(added).toBe(false);
      expect(contentRepository.saved).toHaveLength(0);
    });

    it('a failed pull propagates out of sync()', async () => {
      const core = makeCoreMock({ pullError: 'server exploded' });
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      await expect(client.sync(SyncStrategy.FULL_PULL)).rejects.toThrow(
        'server exploded',
      );
    });
  });

  describe('combined push + pull (PARTIAL and FULL do both)', () => {
    it('sync(FULL) pushes (partial=false) and pulls (no heads), returning the pull count', async () => {
      const content = makeContent('full-combined');
      const pulled = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content,
      });
      const core = makeCoreMock({
        pullBundles: () => [makeBundle(pulled, content)],
      });
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      const count = await client.sync(SyncStrategy.FULL);

      expect(count).toBe(1);
      expect(core.pushLocalEvents).toHaveBeenCalledWith(
        identityA.key,
        'http://server-1',
        false,
      );
      expect(core.fetchQuery).toHaveBeenCalledTimes(1);
      expect(pullQueryArgs(core).heads).toEqual([]);
    });

    it('sync(PARTIAL) pushes (partial=true) and pulls with stored heads', async () => {
      // Contiguous sequences 1..5; the head is the highest (5).
      const seeded = makeStream({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        count: 5,
        label: 'seeded',
      });
      const core = makeCoreMock({ pullBundles: () => [] });
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
        events: seeded,
      });

      await client.sync(SyncStrategy.PARTIAL);

      expect(core.pushLocalEvents).toHaveBeenCalledWith(
        identityA.key,
        'http://server-1',
        true,
      );
      const heads = pullQueryArgs(core).heads;
      // The FEED stream head (seq 5) plus the seeded IDENTITY stream head (seq 1).
      expect(heads).toHaveLength(2);
      const sA = bytesToHex(signerA.publicKey.key);
      const feedHead = heads.find(
        (h) =>
          h.collection === COLLECTION.FEED &&
          bytesToHex(new Uint8Array(h.signedBy.key)) === sA,
      );
      expect(feedHead.sequence).toBe(5n);
    });

    it('a push failure is swallowed but the pull result is still returned', async () => {
      const content = makeContent('survives');
      const pulled = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content,
      });
      const core = makeCoreMock({
        pullBundles: () => [makeBundle(pulled, content)],
        pushResponse: async () => {
          throw new Error('push down');
        },
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      const count = await client.sync(SyncStrategy.FULL);

      expect(count).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        'Sync failed for a server:',
        expect.anything(),
      );
    });

    it('a pull failure throws even when the push succeeds', async () => {
      const core = makeCoreMock({
        pullError: 'pull down',
        pushResponse: async () => putEventsResponse({}),
      });
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      await expect(client.sync(SyncStrategy.FULL)).rejects.toThrow('pull down');
    });
  });

  describe('multi scope (multiple servers / signers / identities)', () => {
    const servers = ['http://server-1', 'http://server-2', 'http://server-3'];

    /**
     * Active identity (A) with deliberately uneven stream depths:
     *   (FEED, signerA)    -> 2 events  (seq 1,2)
     *   (PROFILE, signerA) -> 1 event   (seq 1)
     *   (FEED, signerB)    -> 3 events  (seq 1,2,3)
     *   (GRAPH, signerB)   -> 0 events  (empty stream)
     * Plus an unrelated identity B that must never be touched.
     */
    const seedStore = () => [
      ...makeStream({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        count: 2,
        label: 'a-feed',
      }),
      ...makeStream({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.PROFILE,
        count: 1,
        label: 'a-profile',
      }),
      ...makeStream({
        signer: signerB,
        identity: identityA,
        collection: COLLECTION.FEED,
        count: 3,
        label: 'b-feed',
      }),
      // (GRAPH, signerB) is intentionally absent — an empty stream.
      // Unrelated identity B — different identity AND different signer.
      ...makeStream({
        signer: signerOther,
        identity: identityB,
        collection: COLLECTION.FEED,
        count: 2,
        label: 'other',
      }),
    ];

    it('full push targets every server with the active identity only', async () => {
      const core = makeCoreMock();
      const { client } = makeClient({
        core,
        servers,
        identity: identityA,
        otherIdentities: [identityB],
        signer: signerA,
        events: seedStore(),
      });

      await client.sync(SyncStrategy.FULL_PUSH);

      expect(core.pushLocalEvents).toHaveBeenCalledTimes(servers.length);
      for (const server of servers) {
        expect(core.pushLocalEvents).toHaveBeenCalledWith(
          identityA.key,
          server,
          false,
        );
      }
      // Never pushed for another identity.
      for (const call of core.pushLocalEvents.mock.calls) {
        expect(call[0]).toBe(identityA.key);
      }
    });

    it('pull requests only the active identity', async () => {
      const core = makeCoreMock({ pullBundles: () => [] });
      const { client } = makeClient({
        core,
        servers,
        identity: identityA,
        otherIdentities: [identityB],
        signer: signerA,
        events: seedStore(),
      });

      await client.sync(SyncStrategy.FULL_PULL);

      expect(pullQueryArgs(core).identity).toBe(identityA.key);
    });

    it('partial pull derives exactly one head per non-empty stream, never cross-wired', async () => {
      const core = makeCoreMock({ pullBundles: () => [] });
      const { client } = makeClient({
        core,
        servers,
        identity: identityA,
        otherIdentities: [identityB],
        signer: signerA,
        events: seedStore(),
      });

      await (client as any).pull(true);

      const heads = pullQueryArgs(core).heads;
      // 4 non-empty streams -> 4 heads: the 3 content streams plus the seeded
      // IDENTITY stream (GRAPH/signerB is empty and contributes none).
      expect(heads).toHaveLength(4);

      const byStream = new Map(
        heads.map((h) => [
          `${h.collection}|${bytesToHex(new Uint8Array(h.signedBy.key))}`,
          h.sequence,
        ]),
      );
      const sA = bytesToHex(signerA.publicKey.key);
      const sB = bytesToHex(signerB.publicKey.key);
      // Correct max sequence per stream, no cross-wiring.
      expect(byStream.get(`${COLLECTION.FEED}|${sA}`)).toBe(2n);
      expect(byStream.get(`${COLLECTION.PROFILE}|${sA}`)).toBe(1n);
      expect(byStream.get(`${COLLECTION.FEED}|${sB}`)).toBe(3n);
      expect(byStream.get(`${COLLECTION.IDENTITY}|${sA}`)).toBe(1n);
      // Empty stream contributes no head.
      expect(byStream.has(`${COLLECTION.GRAPH}|${sB}`)).toBe(false);
      // Every head belongs to the active identity.
      for (const h of heads) expect(h.identity).toBe(identityA.key);
    });

    it('push-only sync does not mutate the event store', async () => {
      const core = makeCoreMock();
      const { client, eventRepository } = makeClient({
        core,
        servers,
        identity: identityA,
        otherIdentities: [identityB],
        signer: signerA,
        events: seedStore(),
      });
      const before = (await eventRepository.getAll()).length;

      await client.sync(SyncStrategy.FULL_PUSH);

      expect(eventRepository.saved).toHaveLength(0);
      expect((await eventRepository.getAll()).length).toBe(before);
    });

    it('newCount counts only genuinely new events; existing ones are not re-saved', async () => {
      const existingContent = makeContent('already-here');
      const existing = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content: existingContent,
      });
      const freshContent = makeContent('brand-new');
      const fresh = makeSignedEvent({
        signer: signerB,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content: freshContent,
      });
      const core = makeCoreMock({
        pullBundles: () => [
          makeBundle(existing, existingContent),
          makeBundle(fresh, freshContent),
        ],
      });
      const { client, eventRepository, contentRepository } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
        events: [existing],
      });

      const count = await (client as any).pull(false);

      expect(count).toBe(1); // only `fresh` is new
      // Only `fresh` is saved, and it is exactly `fresh`.
      expect(eventRepository.saved).toEqual([fresh]);

      // `fresh` landed under its own key, paired with its own content — no swap.
      const freshEvent = Proto.Event.fromBinary(fresh.eventBytes);
      expect(await eventRepository.getByEventKey(freshEvent.key!)).toEqual(
        fresh,
      );
      expect(await contentRepository.get(freshEvent.contentDigest!)).toEqual(
        freshContent,
      );
      // `existing` is untouched (not overwritten with the wrong data).
      const existingEvent = Proto.Event.fromBinary(existing.eventBytes);
      expect(await eventRepository.getByEventKey(existingEvent.key!)).toEqual(
        existing,
      );
    });

    it('strategy matrix: pull-only never pushes, push-only never pulls', async () => {
      const make = () => {
        const core = makeCoreMock({ pullBundles: () => [] });
        const { client } = makeClient({
          core,
          servers,
          identity: identityA,
          signer: signerA,
        });
        return { core, client };
      };

      for (const strategy of [
        SyncStrategy.FULL_PULL,
        SyncStrategy.PARTIAL_PULL,
      ]) {
        const { core, client } = make();
        await client.sync(strategy);
        expect(core.pushLocalEvents).not.toHaveBeenCalled();
        expect(core.fetchQuery).toHaveBeenCalledTimes(1);
      }

      for (const strategy of [
        SyncStrategy.FULL_PUSH,
        SyncStrategy.PARTIAL_PUSH,
      ]) {
        const { core, client } = make();
        const count = await client.sync(strategy);
        expect(count).toBe(0);
        expect(core.fetchQuery).not.toHaveBeenCalled();
        expect(core.pushLocalEvents).toHaveBeenCalledTimes(servers.length);
      }
    });
  });

  describe('blobs', () => {
    it('full pull fetches missing referenced blobs, skipping ones already present', async () => {
      const presentBytes = new Uint8Array([1, 1, 1, 1]);
      const missingBytes = new Uint8Array([2, 2, 2, 2]);
      const presentBlob = makeBlob(presentBytes, 'image/png');
      const missingBlob = makeBlob(missingBytes, 'image/jpeg');

      const content = makeContent('with-blobs', [presentBlob, missingBlob]);
      const event = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content,
      });
      const core = makeCoreMock({
        pullBundles: () => [makeBundle(event, content)],
      });

      // The present blob is already in the local filestore.
      const fileStore = new FakeFileStore([
        { digest: presentBlob.digest!, bytes: presentBytes },
      ]);
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
        fileStore,
      });
      const fetchSpy = vi
        .spyOn(client, 'fetchBlobBytes')
        .mockResolvedValue(missingBytes);

      await (client as any).pull(false);

      // Only the missing blob is fetched and stored.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(toDigestKey(fetchSpy.mock.calls[0][0])).toBe(
        toDigestKey(missingBlob.digest!),
      );
      expect(fileStore.put).toHaveBeenCalledTimes(1);
      expect(await fileStore.has(missingBlob.digest!)).toBe(true);
    });

    it('a blob referenced by multiple events is fetched only once', async () => {
      const sharedBytes = new Uint8Array([7, 7, 7]);
      const uniqueBytes = new Uint8Array([8, 8, 8, 8]);
      const sharedBlob = makeBlob(sharedBytes);
      const uniqueBlob = makeBlob(uniqueBytes);

      const content1 = makeContent('post-1', [sharedBlob]);
      const content2 = makeContent('post-2', [sharedBlob, uniqueBlob]);
      const event1 = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content: content1,
      });
      const event2 = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 2,
        content: content2,
      });
      const core = makeCoreMock({
        pullBundles: () => [
          makeBundle(event1, content1),
          makeBundle(event2, content2),
        ],
      });
      const { client, contentRepository } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      const fetched: string[] = [];
      vi.spyOn(client, 'fetchBlobBytes').mockImplementation(async (digest) => {
        fetched.push(toDigestKey(digest));
        return toDigestKey(digest) === toDigestKey(sharedBlob.digest!)
          ? sharedBytes
          : uniqueBytes;
      });

      await (client as any).pull(false);

      // Shared blob fetched once; unique blob fetched once.
      expect(
        fetched.filter((d) => d === toDigestKey(sharedBlob.digest!)),
      ).toHaveLength(1);
      expect(
        fetched.filter((d) => d === toDigestKey(uniqueBlob.digest!)),
      ).toHaveLength(1);
      expect(fetched).toHaveLength(2);

      // Each content persisted under its own digest — not swapped.
      expect(await contentRepository.get(buildDigest(content1))).toEqual(
        content1,
      );
      expect(await contentRepository.get(buildDigest(content2))).toEqual(
        content2,
      );
    });

    it('uploads each server-requested blob to the requesting server only', async () => {
      const blob1Bytes = new Uint8Array([10, 10]);
      const blob2Bytes = new Uint8Array([20, 20, 20]);
      const blob1 = makeBlob(blob1Bytes);
      const blob2 = makeBlob(blob2Bytes);
      const servers = ['http://server-1', 'http://server-2'];

      // server-1 requests blob1, server-2 requests blob2.
      const core = makeCoreMock({
        pullBundles: () => [],
        pushResponse: async (_identity, server) =>
          server === 'http://server-1'
            ? putEventsResponse({ requestedBlobs: [blob1] })
            : putEventsResponse({ requestedBlobs: [blob2] }),
      });
      const fileStore = new FakeFileStore([
        { digest: blob1.digest!, bytes: blob1Bytes },
        { digest: blob2.digest!, bytes: blob2Bytes },
      ]);
      const { client } = makeClient({
        core,
        servers,
        identity: identityA,
        signer: signerA,
        fileStore,
      });
      const uploadSpy = vi
        .spyOn(client, 'uploadBlob')
        .mockResolvedValue(undefined);

      await client.sync(SyncStrategy.FULL);

      expect(uploadSpy).toHaveBeenCalledTimes(2);
      const byBlob = new Map(
        uploadSpy.mock.calls.map((c) => [
          toDigestKey((c[0] as Proto.Blob).digest!),
          { body: c[1], servers: c[2] },
        ]),
      );
      expect(byBlob.get(toDigestKey(blob1.digest!))!.servers).toEqual([
        'http://server-1',
      ]);
      expect(byBlob.get(toDigestKey(blob1.digest!))!.body).toEqual(blob1Bytes);
      expect(byBlob.get(toDigestKey(blob2.digest!))!.servers).toEqual([
        'http://server-2',
      ]);
      expect(byBlob.get(toDigestKey(blob2.digest!))!.body).toEqual(blob2Bytes);
    });

    it('skips a requested blob that is missing from the local filestore', async () => {
      const blob = makeBlob(new Uint8Array([5, 5, 5]));
      const core = makeCoreMock({
        pullBundles: () => [],
        pushResponse: async () => putEventsResponse({ requestedBlobs: [blob] }),
      });
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
        fileStore: new FakeFileStore(), // empty
      });
      const uploadSpy = vi
        .spyOn(client, 'uploadBlob')
        .mockResolvedValue(undefined);

      await client.sync(SyncStrategy.FULL);

      expect(uploadSpy).not.toHaveBeenCalled();
    });

    it('saves new content for an event we already have', async () => {
      const content = makeContent('content-for-known-event');
      const event = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content,
      });
      const core = makeCoreMock({
        pullBundles: () => [makeBundle(event, content)],
      });
      // Seed the event but NOT its content.
      const { client, eventRepository, contentRepository } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
        events: [event],
      });

      const count = await (client as any).pull(false);

      expect(count).toBe(0); // the event is not new
      expect(eventRepository.saved).toHaveLength(0); // event not re-saved
      // ...but the previously-missing content is now persisted.
      const decoded = Proto.Event.fromBinary(event.eventBytes);
      expect(await contentRepository.get(decoded.contentDigest!)).toEqual(
        content,
      );
      expect(contentRepository.saved).toContainEqual({
        digest: decoded.contentDigest,
        content,
      });
    });

    it('requests a missing blob referenced by content we already have', async () => {
      const blobBytes = new Uint8Array([42, 42, 42]);
      const blob = makeBlob(blobBytes);
      const content = makeContent('known-content', [blob]);
      const event = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content,
      });
      const core = makeCoreMock({
        pullBundles: () => [makeBundle(event, content)],
      });
      // Seed BOTH the event and its content; the blob is absent from the
      // (empty) filestore.
      const { client, fileStore } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
        events: [event],
        contents: [{ digest: buildDigest(content), content }],
      });
      const fetchSpy = vi
        .spyOn(client, 'fetchBlobBytes')
        .mockResolvedValue(blobBytes);

      const count = await (client as any).pull(false);

      // Nothing new, yet the missing blob is still requested and stored.
      expect(count).toBe(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(toDigestKey(fetchSpy.mock.calls[0][0])).toBe(
        toDigestKey(blob.digest!),
      );
      expect(fileStore.put).toHaveBeenCalledTimes(1);
      expect(await fileStore.has(blob.digest!)).toBe(true);
    });
  });

  describe('failure paths and error logging', () => {
    it('skips a malformed bundle (logs warn) but still saves valid siblings', async () => {
      const goodContent = makeContent('good');
      const good = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content: goodContent,
      });
      const badBundle = Proto.EventBundle.create({
        signedEvent: Proto.SignedEvent.create({
          signature: new Uint8Array([9]),
          eventBytes: new Uint8Array([0xff, 0xff, 0xff, 0xff]), // not a valid Event
        }),
        eventProofs: [],
      });
      const core = makeCoreMock({
        pullBundles: () => [badBundle, makeBundle(good, goodContent)],
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { client, eventRepository, contentRepository } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      const count = await (client as any).pull(false);

      expect(count).toBe(1); // only the good event counted
      // The good sibling, with its own content, is what landed.
      expect(eventRepository.saved).toEqual([good]);
      const goodEvent = Proto.Event.fromBinary(good.eventBytes);
      expect(await contentRepository.get(goodEvent.contentDigest!)).toEqual(
        goodContent,
      );
      expect(warnSpy).toHaveBeenCalledWith('Pull event:', expect.anything());
    });

    it('skips undecodable content (logs warn) but still saves the event', async () => {
      const content = makeContent('real');
      const event = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content,
      });
      const bundle = Proto.EventBundle.create({
        signedEvent: event,
        serializedContent: Proto.SerializedContent.create({
          contentBytes: new Uint8Array([0xff, 0xff, 0xff]), // not valid Content
        }),
        eventProofs: [],
      });
      const core = makeCoreMock({ pullBundles: () => [bundle] });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { client, eventRepository, contentRepository } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      const count = await (client as any).pull(false);

      expect(count).toBe(1);
      // The event itself is saved exactly; its content is genuinely absent.
      expect(eventRepository.saved).toEqual([event]);
      expect(contentRepository.saved).toHaveLength(0);
      const savedEvent = Proto.Event.fromBinary(event.eventBytes);
      expect(await contentRepository.get(savedEvent.contentDigest!)).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        'Pull event content:',
        expect.anything(),
      );
    });

    it('logs server-reported push errors but still uploads requested blobs', async () => {
      const blobBytes = new Uint8Array([3, 3, 3]);
      const blob = makeBlob(blobBytes);
      const pushError = Proto.PutEventError.create({});
      const core = makeCoreMock({
        pullBundles: () => [],
        pushResponse: async () =>
          putEventsResponse({ errors: [pushError], requestedBlobs: [blob] }),
      });
      const fileStore = new FakeFileStore([
        { digest: blob.digest!, bytes: blobBytes },
      ]);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { client } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
        fileStore,
      });
      const uploadSpy = vi
        .spyOn(client, 'uploadBlob')
        .mockResolvedValue(undefined);

      await client.sync(SyncStrategy.FULL);

      expect(errorSpy).toHaveBeenCalledWith(
        'Error from event push:',
        expect.anything(),
      );
      expect(uploadSpy).toHaveBeenCalledTimes(1);
    });

    it('logs a blob-pull failure and stores nothing for it', async () => {
      const blob = makeBlob(new Uint8Array([4, 4, 4, 4]));
      const content = makeContent('blobby', [blob]);
      const event = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content,
      });
      const core = makeCoreMock({
        pullBundles: () => [makeBundle(event, content)],
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { client, fileStore } = makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });
      vi.spyOn(client, 'fetchBlobBytes').mockRejectedValue(
        new Error('blob fetch failed'),
      );

      const count = await (client as any).pull(false);

      expect(count).toBe(1); // event still counted
      expect(fileStore.put).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        'pullBlobs failed:',
        expect.anything(),
      );
    });
  });

  describe('edge cases', () => {
    it('sync() with no active identity returns 0 and does nothing', async () => {
      const core = makeCoreMock();
      const { client } = makeClient({ core, signer: signerA }); // no identity

      const count = await client.sync(SyncStrategy.FULL);

      expect(count).toBe(0);
      expect(core.fetchQuery).not.toHaveBeenCalled();
      expect(core.pushLocalEvents).not.toHaveBeenCalled();
    });

    it('pull() throws when there is no active identity', async () => {
      const { client } = makeClient({ signer: signerA }); // no identity

      await expect((client as any).pull(false)).rejects.toThrow(
        'No active identity',
      );
    });

    it('sync() with no servers does not push', async () => {
      const core = makeCoreMock({ pullBundles: () => [] });
      const { client } = makeClient({
        core,
        servers: [],
        identity: identityA,
        signer: signerA,
        events: makeStream({
          signer: signerA,
          identity: identityA,
          collection: COLLECTION.FEED,
          count: 2,
          label: 'unpushed',
        }),
      });

      const count = await client.sync(SyncStrategy.FULL);

      expect(count).toBe(0);
      expect(core.pushLocalEvents).not.toHaveBeenCalled();
    });
  });

  describe('trySaveBundle guards', () => {
    it('returns false and saves nothing when the bundle has no signedEvent', async () => {
      const { client, eventRepository } = makeClient({
        identity: identityA,
        signer: signerA,
      });
      const bundle = Proto.EventBundle.create({ eventProofs: [] });

      const saved = await (client as any).trySaveBundle(bundle, []);

      expect(saved).toBe(false);
      expect(eventRepository.saved).toHaveLength(0);
    });

    it('returns false and saves nothing when the event has no key', async () => {
      const { client, eventRepository } = makeClient({
        identity: identityA,
        signer: signerA,
      });
      const bundle = Proto.EventBundle.create({
        signedEvent: Proto.SignedEvent.create({
          signature: new Uint8Array([1]),
          eventBytes: Proto.Event.toBinary(Proto.Event.create({})), // no key
        }),
        eventProofs: [],
      });

      const saved = await (client as any).trySaveBundle(bundle, []);

      expect(saved).toBe(false);
      expect(eventRepository.saved).toHaveLength(0);
    });

    it('returns false and saves nothing when the event key has no signedBy', async () => {
      const { client, eventRepository } = makeClient({
        identity: identityA,
        signer: signerA,
      });
      const event = Proto.Event.create({
        key: Proto.EventKey.create({
          collection: COLLECTION.FEED,
          identity: identityA.key,
          sequence: 1n,
        }), // no signedBy
      });
      const bundle = Proto.EventBundle.create({
        signedEvent: Proto.SignedEvent.create({
          signature: new Uint8Array([1]),
          eventBytes: Proto.Event.toBinary(event),
        }),
        eventProofs: [],
      });

      const saved = await (client as any).trySaveBundle(bundle, []);

      expect(saved).toBe(false);
      expect(eventRepository.saved).toHaveLength(0);
    });

    it('returns false and does not re-save an already-present event', async () => {
      const existing = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content: makeContent('already-here'),
      });
      const { client, eventRepository } = makeClient({
        identity: identityA,
        signer: signerA,
        events: [existing],
      });
      // No serializedContent, so the content path is a no-op; isolate the
      // event dedup-by-key guard.
      const bundle = Proto.EventBundle.create({
        signedEvent: existing,
        eventProofs: [],
      });

      const saved = await (client as any).trySaveBundle(bundle, []);

      expect(saved).toBe(false);
      expect(eventRepository.saved).toHaveLength(0);
    });
  });

  describe('trySaveContent guards', () => {
    it('returns false and collects no blobs when the bundle has no content', async () => {
      const { client, contentRepository } = makeClient({
        identity: identityA,
        signer: signerA,
      });
      const event = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content: makeContent('x'),
      });
      const decodedEvent = Proto.Event.fromBinary(event.eventBytes);
      const bundle = Proto.EventBundle.create({
        signedEvent: event,
        eventProofs: [],
      }); // no serializedContent

      const blobs: Proto.Blob[] = [];
      const saved = await (client as any).trySaveContent(
        decodedEvent,
        bundle,
        blobs,
      );

      expect(saved).toBe(false);
      expect(blobs).toHaveLength(0);
      expect(contentRepository.saved).toHaveLength(0);
    });

    it('returns false and collects no blobs when the event has no contentDigest', async () => {
      const { client, contentRepository } = makeClient({
        identity: identityA,
        signer: signerA,
      });
      const content = makeContent('with-blob', [
        makeBlob(new Uint8Array([1, 2, 3])),
      ]);
      const bundle = makeBundle(
        makeSignedEvent({
          signer: signerA,
          identity: identityA,
          collection: COLLECTION.FEED,
          sequence: 1,
          content,
        }),
        content,
      );
      const eventWithoutDigest = Proto.Event.create({}); // no contentDigest

      const blobs: Proto.Blob[] = [];
      const saved = await (client as any).trySaveContent(
        eventWithoutDigest,
        bundle,
        blobs,
      );

      expect(saved).toBe(false);
      expect(blobs).toHaveLength(0);
      expect(contentRepository.saved).toHaveLength(0);
    });

    it('collects referenced blobs even when the content already exists', async () => {
      const blob = makeBlob(new Uint8Array([4, 5, 6]));
      const content = makeContent('seen', [blob]);
      const digest = buildDigest(content);
      const { client, contentRepository } = makeClient({
        identity: identityA,
        signer: signerA,
        contents: [{ digest, content }], // content already present
      });
      const event = Proto.Event.create({ contentDigest: digest });
      const bundle = makeBundle(
        makeSignedEvent({
          signer: signerA,
          identity: identityA,
          collection: COLLECTION.FEED,
          sequence: 1,
          content,
        }),
        content,
      );

      const blobs: Proto.Blob[] = [];
      const saved = await (client as any).trySaveContent(event, bundle, blobs);

      // Already present, so not re-saved...
      expect(saved).toBe(false);
      expect(contentRepository.saved).toHaveLength(0);
      // ...but its blob is still collected so the pull can fetch it.
      expect(blobs).toEqual([blob]);
    });
  });
});

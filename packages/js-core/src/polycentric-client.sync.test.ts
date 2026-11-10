import { describe, expect, it, vi } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { Query, QueryStatus } from '@polycentric/rs-core-wasm/generated';
import type {
  EventKey,
  EventPushIssues,
  PushResult,
} from '@polycentric/rs-core-wasm';
import { PolycentricClient } from './polycentric-client';
import { StorageHandle } from './data-store/storage-handle';
import { COLLECTION, SyncStrategy } from './constants';
import { bytesToHex, toDigestKey } from './utils/hex';
import * as Proto from './proto/v2';
import { FileStore } from './file-store/file-store';
import {
  MemoryFileStoreDriver,
  MemoryStorageDriver,
} from './memory-storage/memory-storage';
import type {
  ContentStatus,
  EventRow,
  EventKey as RequiredEventKey,
} from './platform-interfaces/event-repository';

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
 * An event to seed into the event repository.
 * Its content is stored as present when given, absent otherwise.
 */
type SeedEvent =
  | Proto.SignedEvent
  | { signedEvent: Proto.SignedEvent; content: Proto.Content };

/**
 * An identity and the identity-collection data that backs it.
 * `identityEvents` are seeded into the repository so validity checks can
 * resolve the identity's authorized keys.
 */
interface TestIdentity {
  key: string;
  rotationKeys: Signer[];
  signingKeys: Signer[];
  identityEvents: SeedEvent[];
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
  const signedEvent = makeSignedEvent({
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
    identityEvents: [{ signedEvent, content }],
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
  /** Overrides the digest of `content`. */
  contentDigest?: Proto.ContentDigest;
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
    contentDigest: args.contentDigest ?? buildDigest(args.content),
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

function pushResult(opts: {
  requestedBlobs?: Proto.Blob[];
  eventIssues?: EventPushIssues[];
}): PushResult {
  return {
    response: Proto.PutEventsResponse.toBinary(
      Proto.PutEventsResponse.create({
        requestedBlobs: opts.requestedBlobs ?? [],
      }),
    ).buffer as ArrayBuffer,
    eventIssues: opts.eventIssues ?? [],
  };
}

/** The core's report of server errors/warnings for one pushed event. */
function buildEventIssues(
  sequence: number,
  opts: { errors?: string[]; warnings?: string[] },
): EventPushIssues {
  return {
    key: {
      collection: COLLECTION.FEED,
      identity: 'identity',
      signedBy: { keyType: 1, key: new Uint8Array([1]).buffer },
      sequence: BigInt(sequence),
    },
    errors: opts.errors ?? [],
    warnings: opts.warnings ?? [],
  };
}

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

/** The event key of a signed event, in the repository's required form. */
function requiredKeyOf(signedEvent: Proto.SignedEvent): RequiredEventKey {
  const key = Proto.Event.fromBinary(signedEvent.eventBytes).key!;
  return { ...key, signedBy: key.signedBy! };
}

/**
 * A repository row for seeding an event.
 * The content is marked present when given, absent otherwise.
 */
function seedRow(owner: string, seed: SeedEvent): EventRow {
  const { signedEvent, content } =
    'signedEvent' in seed ? seed : { signedEvent: seed, content: undefined };
  return {
    owner,
    eventKey: requiredKeyOf(signedEvent),
    eventBytes: signedEvent.eventBytes,
    eventSignature: signedEvent.signature,
    contentStatus: content ? 'present' : 'absent',
    contentBytes: content ? Proto.Content.toBinary(content) : undefined,
  };
}

/** A persisted row decoded back into the protos the tests compare against. */
interface StoredEvent {
  signedEvent: Proto.SignedEvent;
  contentStatus: ContentStatus;
  content?: Proto.Content;
}

function decodeRow(row: EventRow): StoredEvent {
  return {
    signedEvent: Proto.SignedEvent.create({
      signature: row.eventSignature,
      eventBytes: row.eventBytes,
    }),
    contentStatus: row.contentStatus,
    content: row.contentBytes
      ? Proto.Content.fromBinary(row.contentBytes)
      : undefined,
  };
}

/**
 * In-memory file store driver pre-seeded with the blob bodies the client
 * already has.
 */
async function makeFileStoreDriver(
  owner: string,
  entries: { digest: Proto.ContentDigest; bytes: Uint8Array }[] = [],
): Promise<MemoryFileStoreDriver> {
  const driver = new MemoryFileStoreDriver();
  const fileStore = new FileStore(driver);
  for (const e of entries) await fileStore.put(owner, e.digest, e.bytes);
  return driver;
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
   * Per-server push result, or undefined when there was nothing to push.
   * May reject.
   */
  pushResponse?: (
    identity: string,
    server: string,
    partial: boolean,
  ) => Promise<PushResult | undefined>;
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
          observer.complete();
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
        observer.complete();
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
    setActiveIdentity: vi.fn(),
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
  /** Events to seed, with their content when it should be present. */
  events?: SeedEvent[];
  fileStoreDriver?: MemoryFileStoreDriver;
}

/**
 * Build a `PolycentricClient` wired to the in-memory mocks and ready to sync.
 * The constructor does not run `initialize()`, so the fields that step would
 * normally populate (storage handle, server list, active identity, current key
 * pair) are set directly here, and the seeded events/content are loaded into
 * an in-memory event repository owned by the active identity.
 * Nothing is persisted without an owner, so seeding or reading back events
 * requires an active identity.
 * Returns the client alongside the mocks so tests can both drive behavior and
 * inspect what was read/written:
 * - `stored(event)` reads back what the repository holds for an event.
 * - `inserted()` lists the events newly inserted after seeding.
 * - `addContent` spies on content filled in for already-present events.
 */
async function makeClient(args: MakeClientArgs = {}) {
  const core = args.core ?? makeCoreMock();
  const owner = args.identity?.key;

  // Seed each identity's identity event + document so validity checks can
  // resolve its authorized keys.
  const seededIdentities = [
    ...(args.identity ? [args.identity] : []),
    ...(args.otherIdentities ?? []),
  ];
  const eventRepository = new MemoryStorageDriver().createEventRepository();
  for (const seed of [
    ...seededIdentities.flatMap((i) => i.identityEvents),
    ...(args.events ?? []),
  ]) {
    if (!owner) throw new Error('Seeding events requires an active identity');
    await eventRepository.insert(seedRow(owner, seed));
  }

  // Spy after seeding so seeded events aren't counted.
  const insert = vi.spyOn(eventRepository, 'insert');
  const addContent = vi.spyOn(eventRepository, 'addContent');
  const inserted = (): Proto.SignedEvent[] =>
    insert.mock.calls.map(([row]) => decodeRow(row).signedEvent);
  const stored = async (
    signedEvent: Proto.SignedEvent,
  ): Promise<StoredEvent | null> => {
    if (!owner) throw new Error('Reading events requires an active identity');
    const row = await eventRepository.get(owner, requiredKeyOf(signedEvent));
    return row ? decodeRow(row) : null;
  };

  const client = new PolycentricClient({
    core,
    storageDriver: {} as any,
    filestoreDriver: args.fileStoreDriver ?? new MemoryFileStoreDriver(),
  });

  (client as any).storageHandle = new StorageHandle({
    eventRepository,
    loginRepository: {} as any,
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

  // Spy after construction so seeded blobs aren't counted.
  // Tests assert which blobs got fetched and stored during a pull.
  vi.spyOn(client.fileStore, 'put');
  const fileStore = client.fileStore;

  return {
    client,
    core,
    eventRepository,
    fileStore,
    stored,
    inserted,
    addContent,
  };
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
    it('full pull persists new events + content and returns the pulled count', async () => {
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
      const { client, stored } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      const count = await (client as any).pull(false);

      expect(count).toBe(1);
      // The exact event and its content are persisted under its key.
      expect(await stored(remote)).toEqual({
        signedEvent: remote,
        contentStatus: 'present',
        content,
      });
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
      const { client } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
        events: seeded,
      });

      await (client as any).pull(true);

      const heads: EventKey[] = pullQueryArgs(core).heads;
      // The FEED stream head (seq 3) plus the seeded IDENTITY stream head (seq 1).
      expect(heads).toHaveLength(2);
      const byStream = new Map<string, EventKey>(
        heads.map((h) => [
          `${h.collection}|${bytesToHex(new Uint8Array(h.signedBy.key))}`,
          h,
        ]),
      );
      const sA = bytesToHex(signerA.publicKey.key);
      const feedHead = byStream.get(`${COLLECTION.FEED}|${sA}`);
      expect(feedHead?.identity).toBe(identityA.key);
      expect(feedHead?.sequence).toBe(3n);
      expect(byStream.get(`${COLLECTION.IDENTITY}|${sA}`)?.sequence).toBe(1n);
    });

    it('full push calls pushLocalEvents once with partial=false and pulls nothing', async () => {
      const core = makeCoreMock();
      const { client } = await makeClient({
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
      const { client } = await makeClient({
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

    it('does not rewrite an event whose content is already present', async () => {
      const content = makeContent('dup');
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
      const { client, stored, inserted, addContent } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
        events: [{ signedEvent: event, content }],
      });

      const count = await (client as any).pull(false);

      expect(count).toBe(1); // counts bundles pulled, not new events
      expect(inserted()).toEqual([]);
      expect(addContent).not.toHaveBeenCalled();
      expect(await stored(event)).toEqual({
        signedEvent: event,
        contentStatus: 'present',
        content,
      });
    });

    it('a failed pull propagates out of sync()', async () => {
      const core = makeCoreMock({ pullError: 'server exploded' });
      const { client } = await makeClient({
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
      const { client } = await makeClient({
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
      const { client } = await makeClient({
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
      const heads: EventKey[] = pullQueryArgs(core).heads;
      // The FEED stream head (seq 5) plus the seeded IDENTITY stream head (seq 1).
      expect(heads).toHaveLength(2);
      const sA = bytesToHex(signerA.publicKey.key);
      const feedHead = heads.find(
        (h) =>
          h.collection === COLLECTION.FEED &&
          bytesToHex(new Uint8Array(h.signedBy.key)) === sA,
      );
      expect(feedHead?.sequence).toBe(5n);
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
      const { client } = await makeClient({
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
        pushResponse: async () => pushResult({}),
      });
      const { client } = await makeClient({
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
      const { client } = await makeClient({
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
      const { client } = await makeClient({
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
      const { client } = await makeClient({
        core,
        servers,
        identity: identityA,
        otherIdentities: [identityB],
        signer: signerA,
        events: seedStore(),
      });

      await (client as any).pull(true);

      const heads: EventKey[] = pullQueryArgs(core).heads;
      // 4 non-empty streams -> 4 heads: the 3 content streams plus the seeded
      // IDENTITY stream (GRAPH/signerB is empty and contributes none).
      expect(heads).toHaveLength(4);

      const byStream = new Map<string, bigint>(
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
      const { client, eventRepository, inserted, addContent } =
        await makeClient({
          core,
          servers,
          identity: identityA,
          otherIdentities: [identityB],
          signer: signerA,
          events: seedStore(),
        });
      const before = await eventRepository.getAll(identityA.key);

      await client.sync(SyncStrategy.FULL_PUSH);

      expect(inserted()).toEqual([]);
      expect(addContent).not.toHaveBeenCalled();
      expect(await eventRepository.getAll(identityA.key)).toEqual(before);
    });

    it('counts every pulled bundle; existing events are not re-inserted', async () => {
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
      const { client, stored, inserted } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
        events: [existing],
      });

      const count = await (client as any).pull(false);

      expect(count).toBe(2); // every bundle the servers returned
      // Only `fresh` is inserted, and it is exactly `fresh`.
      expect(inserted()).toEqual([fresh]);

      // `fresh` landed under its own key, paired with its own content — no swap.
      expect(await stored(fresh)).toEqual({
        signedEvent: fresh,
        contentStatus: 'present',
        content: freshContent,
      });
      // `existing` keeps its own event bytes and gains its own content.
      expect(await stored(existing)).toEqual({
        signedEvent: existing,
        contentStatus: 'present',
        content: existingContent,
      });
    });

    it('strategy matrix: pull-only never pushes, push-only never pulls', async () => {
      const make = async () => {
        const core = makeCoreMock({ pullBundles: () => [] });
        const { client } = await makeClient({
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
        const { core, client } = await make();
        await client.sync(strategy);
        expect(core.pushLocalEvents).not.toHaveBeenCalled();
        expect(core.fetchQuery).toHaveBeenCalledTimes(1);
      }

      for (const strategy of [
        SyncStrategy.FULL_PUSH,
        SyncStrategy.PARTIAL_PUSH,
      ]) {
        const { core, client } = await make();
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
      const fileStoreDriver = await makeFileStoreDriver(identityA.key, [
        { digest: presentBlob.digest!, bytes: presentBytes },
      ]);
      const { client, fileStore } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
        fileStoreDriver,
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
      expect(fileStore.put).toHaveBeenCalledWith(
        identityA.key,
        missingBlob.digest,
        missingBytes,
      );
      expect(await fileStore.has(identityA.key, missingBlob.digest!)).toBe(
        true,
      );
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
      const { client, stored } = await makeClient({
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

      // Each content persisted with its own event — not swapped.
      expect((await stored(event1))?.content).toEqual(content1);
      expect((await stored(event2))?.content).toEqual(content2);
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
            ? pushResult({ requestedBlobs: [blob1] })
            : pushResult({ requestedBlobs: [blob2] }),
      });
      const fileStoreDriver = await makeFileStoreDriver(identityA.key, [
        { digest: blob1.digest!, bytes: blob1Bytes },
        { digest: blob2.digest!, bytes: blob2Bytes },
      ]);
      const { client } = await makeClient({
        core,
        servers,
        identity: identityA,
        signer: signerA,
        fileStoreDriver,
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
        pushResponse: async () => pushResult({ requestedBlobs: [blob] }),
      });
      const { client } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
        fileStoreDriver: new MemoryFileStoreDriver(), // empty
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
      const { client, stored, inserted, addContent } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
        events: [event],
      });

      const count = await (client as any).pull(false);

      expect(count).toBe(1);
      expect(inserted()).toEqual([]); // event not re-inserted
      // ...but the previously-missing content is now persisted.
      expect(addContent).toHaveBeenCalledTimes(1);
      expect(await stored(event)).toEqual({
        signedEvent: event,
        contentStatus: 'present',
        content,
      });
    });

    it('keeps omitted content omitted when it is pulled again', async () => {
      const content = makeContent('deliberately-dropped');
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
      const { client, eventRepository, stored, inserted, addContent } =
        await makeClient({
          core,
          identity: identityA,
          signer: signerA,
          events: [{ signedEvent: event, content }],
        });
      await eventRepository.deleteContent(identityA.key, requiredKeyOf(event));

      await (client as any).pull(false);

      expect(inserted()).toEqual([]);
      expect(addContent).not.toHaveBeenCalled();
      expect(await stored(event)).toEqual({
        signedEvent: event,
        contentStatus: 'omitted',
        content: undefined,
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
      const { client, fileStore } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
        events: [{ signedEvent: event, content }],
      });
      const fetchSpy = vi
        .spyOn(client, 'fetchBlobBytes')
        .mockResolvedValue(blobBytes);

      const count = await (client as any).pull(false);

      // Nothing new, yet the missing blob is still requested and stored.
      expect(count).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(toDigestKey(fetchSpy.mock.calls[0][0])).toBe(
        toDigestKey(blob.digest!),
      );
      expect(fileStore.put).toHaveBeenCalledTimes(1);
      expect(fileStore.put).toHaveBeenCalledWith(
        identityA.key,
        blob.digest,
        blobBytes,
      );
      expect(await fileStore.has(identityA.key, blob.digest!)).toBe(true);
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
      const { client, stored, inserted } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      const count = await (client as any).pull(false);

      expect(count).toBe(2); // every bundle the servers returned
      // The good sibling, with its own content, is what landed.
      expect(inserted()).toEqual([good]);
      expect((await stored(good))?.content).toEqual(goodContent);
      expect(warnSpy).toHaveBeenCalledWith(
        'pull: saving bundle failed:',
        expect.anything(),
      );
    });

    it('never persists content that does not hash to the event digest', async () => {
      const content = makeContent('valid');
      const event = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content,
      });
      // Swap in different content bytes whose sha256 differs from the
      // event's contentDigest.
      const tampered = Proto.EventBundle.create({
        signedEvent: event,
        serializedContent: Proto.SerializedContent.create({
          contentBytes: Proto.Content.toBinary(makeContent('tampered')),
        }),
        eventProofs: [],
      });
      const goodContent = makeContent('good');
      const good = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 2,
        content: goodContent,
      });
      const core = makeCoreMock({
        pullBundles: () => [tampered, makeBundle(good, goodContent)],
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { client, stored } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      await (client as any).pull(false);

      expect((await stored(event))?.content).toBeUndefined();
      expect((await stored(good))?.content).toEqual(goodContent);
      expect(warnSpy).toHaveBeenCalledWith(
        'pull: saving bundle failed:',
        expect.anything(),
      );
    });

    it('content that matches its digest but does not decode does not stop the pull', async () => {
      // Digest the undecodable bytes so they pass the hash check.
      const contentBytes = new Uint8Array([0xff, 0xff, 0xff]); // not valid Content
      const event = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content: makeContent('unused'),
        contentDigest: Proto.ContentDigest.create({
          type: Proto.ContentDigestType.SHA256,
          value: sha256(contentBytes),
        }),
      });
      const bundle = Proto.EventBundle.create({
        signedEvent: event,
        serializedContent: Proto.SerializedContent.create({ contentBytes }),
        eventProofs: [],
      });
      const goodContent = makeContent('good');
      const good = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 2,
        content: goodContent,
      });
      const core = makeCoreMock({
        pullBundles: () => [bundle, makeBundle(good, goodContent)],
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { client, stored } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });

      // Whether the undecodable content is kept is deliberately unspecified.
      await expect((client as any).pull(false)).resolves.toBe(2);
      expect((await stored(good))?.content).toEqual(goodContent);
    });

    it('logs server-reported push errors but still uploads requested blobs', async () => {
      const blobBytes = new Uint8Array([3, 3, 3]);
      const blob = makeBlob(blobBytes);
      const core = makeCoreMock({
        pullBundles: () => [],
        pushResponse: async () =>
          pushResult({
            eventIssues: [buildEventIssues(1, { errors: ['rejected'] })],
            requestedBlobs: [blob],
          }),
      });
      const fileStoreDriver = await makeFileStoreDriver(identityA.key, [
        { digest: blob.digest!, bytes: blobBytes },
      ]);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { client } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
        fileStoreDriver,
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
      const { client, fileStore } = await makeClient({
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

  describe('push results', () => {
    it("emits each server's event issues once all pushes settle", async () => {
      const rejected = buildEventIssues(1, { errors: ['bad signature'] });
      const trimmed = buildEventIssues(2, { warnings: ['app name dropped'] });
      const core = makeCoreMock({
        pullBundles: () => [],
        pushResponse: async (_identity, server) =>
          server === 'http://server-1'
            ? pushResult({ eventIssues: [rejected, trimmed] })
            : pushResult({}),
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { client } = await makeClient({
        core,
        servers: ['http://server-1', 'http://server-2'],
        identity: identityA,
        signer: signerA,
      });
      const listener = vi.fn();
      client.events.onPushResults(listener);

      await client.sync(SyncStrategy.PARTIAL);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([
        {
          identity: identityA.key,
          server: 'http://server-1',
          eventIssues: [rejected, trimmed],
        },
        { identity: identityA.key, server: 'http://server-2', eventIssues: [] },
      ]);
    });

    it('reports a server with nothing to push as clean', async () => {
      const core = makeCoreMock({ pullBundles: () => [] });
      const { client } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });
      const listener = vi.fn();
      client.events.onPushResults(listener);

      await client.sync(SyncStrategy.PARTIAL_PUSH);

      expect(listener).toHaveBeenCalledWith([
        { identity: identityA.key, server: 'http://server-1', eventIssues: [] },
      ]);
    });

    it('reports a failed push as an error for that server', async () => {
      const failure = new Error('push down');
      const core = makeCoreMock({
        pullBundles: () => [],
        pushResponse: async () => {
          throw failure;
        },
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { client } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });
      const listener = vi.fn();
      client.events.onPushResults(listener);

      await client.sync(SyncStrategy.PARTIAL_PUSH);

      expect(listener).toHaveBeenCalledWith([
        {
          identity: identityA.key,
          server: 'http://server-1',
          eventIssues: [],
          error: failure,
        },
      ]);
    });

    it('reports the identity pushed for after the active identity changes', async () => {
      let switchIdentity = () => {};
      const core = makeCoreMock({
        pullBundles: () => [],
        pushResponse: async () => {
          switchIdentity();
          return pushResult({});
        },
      });
      const { client } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });
      switchIdentity = () => {
        client.activeIdentityKey = 'other identity';
      };
      const listener = vi.fn();
      client.events.onPushResults(listener);

      await client.sync(SyncStrategy.PARTIAL_PUSH);

      expect(listener).toHaveBeenCalledWith([
        expect.objectContaining({ identity: identityA.key }),
      ]);
    });

    it('emits nothing for a pull-only sync', async () => {
      const core = makeCoreMock({ pullBundles: () => [] });
      const { client } = await makeClient({
        core,
        identity: identityA,
        signer: signerA,
      });
      const listener = vi.fn();
      client.events.onPushResults(listener);

      await client.sync(SyncStrategy.PARTIAL_PULL);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('sync() with no active identity returns 0 and does nothing', async () => {
      const core = makeCoreMock();
      const { client } = await makeClient({ core, signer: signerA }); // no identity

      const count = await client.sync(SyncStrategy.FULL);

      expect(count).toBe(0);
      expect(core.fetchQuery).not.toHaveBeenCalled();
      expect(core.pushLocalEvents).not.toHaveBeenCalled();
    });

    it('pull() throws when there is no active identity', async () => {
      const { client } = await makeClient({ signer: signerA }); // no identity

      await expect((client as any).pull(false)).rejects.toThrow(
        'No active identity',
      );
    });

    it('sync() with no servers does not push', async () => {
      const core = makeCoreMock({ pullBundles: () => [] });
      const { client } = await makeClient({
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

  describe('saveBundle guards', () => {
    /** A bundle around raw event bytes, signed with a placeholder signature. */
    const bundleOf = (event: Proto.Event): Proto.EventBundle =>
      Proto.EventBundle.create({
        signedEvent: Proto.SignedEvent.create({
          signature: new Uint8Array([1]),
          eventBytes: Proto.Event.toBinary(event),
        }),
        eventProofs: [],
      });

    it('rejects a bundle with no signedEvent and saves nothing', async () => {
      const { client, inserted } = await makeClient({
        identity: identityA,
        signer: signerA,
      });
      const bundle = Proto.EventBundle.create({ eventProofs: [] });

      await expect(client.saveBundle(identityA.key, bundle)).rejects.toThrow(
        'Bundle is missing signedEvent',
      );
      expect(inserted()).toEqual([]);
    });

    it('rejects an event with no key and saves nothing', async () => {
      const { client, inserted } = await makeClient({
        identity: identityA,
        signer: signerA,
      });
      const bundle = bundleOf(Proto.Event.create({})); // no key

      await expect(client.saveBundle(identityA.key, bundle)).rejects.toThrow(
        'event key is incomplete',
      );
      expect(inserted()).toEqual([]);
    });

    it('rejects an event key with no signedBy and saves nothing', async () => {
      const { client, inserted } = await makeClient({
        identity: identityA,
        signer: signerA,
      });
      const bundle = bundleOf(
        Proto.Event.create({
          key: Proto.EventKey.create({
            collection: COLLECTION.FEED,
            identity: identityA.key,
            sequence: 1n,
          }), // no signedBy
        }),
      );

      await expect(client.saveBundle(identityA.key, bundle)).rejects.toThrow(
        'event key is incomplete',
      );
      expect(inserted()).toEqual([]);
    });

    it('rejects an event with no contentDigest and saves nothing', async () => {
      const { client, inserted } = await makeClient({
        identity: identityA,
        signer: signerA,
      });
      const bundle = bundleOf(
        Proto.Event.create({
          key: Proto.EventKey.create({
            collection: COLLECTION.FEED,
            identity: identityA.key,
            signedBy: signerA.publicKey,
            sequence: 1n,
          }),
        }), // no contentDigest
      );

      await expect(client.saveBundle(identityA.key, bundle)).rejects.toThrow(
        'missing content digest',
      );
      expect(inserted()).toEqual([]);
    });

    it('rejects content bytes that do not hash to the event digest and saves nothing', async () => {
      const { client, inserted } = await makeClient({
        identity: identityA,
        signer: signerA,
      });
      const event = makeSignedEvent({
        signer: signerA,
        identity: identityA,
        collection: COLLECTION.FEED,
        sequence: 1,
        content: makeContent('valid'),
      });
      const bundle = makeBundle(event, makeContent('tampered'));

      await expect(client.saveBundle(identityA.key, bundle)).rejects.toThrow(
        'content does not match event digest',
      );
      expect(inserted()).toEqual([]);
    });

    it('stores the event with absent content when the bundle has no content', async () => {
      const { client, stored, inserted } = await makeClient({
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

      await client.saveBundle(identityA.key, makeBundle(event)); // no serializedContent

      expect(inserted()).toEqual([event]);
      expect(await stored(event)).toEqual({
        signedEvent: event,
        contentStatus: 'absent',
        content: undefined,
      });
    });
  });
});

const headsBytes = (heads: Proto.EventKey[]) =>
  Proto.ListHeadsResponse.toBinary(Proto.ListHeadsResponse.create({ heads }))
    .buffer;

/**
 * `makeCoreMock` holding `localHeads`, with a `SubscribeHeads` stream driven
 * by `emitHeads`.
 */
function makeLiveCore(
  opts: CoreMockOptions = {},
  localHeads: Proto.EventKey[] = [],
) {
  const core = makeCoreMock(opts);
  core.localHeads = vi.fn(() => headsBytes(localHeads));
  const otherQuery = core.fetchQuery.getMockImplementation();
  let observer: any;
  const unsubscribe = vi.fn();
  core.fetchQuery.mockImplementation(
    (queryKey: unknown, query: any, queryOpts: unknown) => {
      if (!(query instanceof Query.SubscribeHeads)) {
        return otherQuery(queryKey, query, queryOpts);
      }
      return {
        subscribe(o: any) {
          observer = o;
          return { unsubscribe, isClosed: () => false };
        },
      };
    },
  );
  const emitHeads = (heads: Proto.EventKey[]) =>
    observer.next({ data: headsBytes(heads), status: QueryStatus.Success });
  return { core, emitHeads, unsubscribe };
}

const keyOf = (event: Proto.SignedEvent): Proto.EventKey =>
  Proto.Event.fromBinary(event.eventBytes).key!;

const queriesOf = (
  core: any,
  type: typeof Query.ListEvents | typeof Query.SubscribeHeads,
): any[] =>
  core.fetchQuery.mock.calls.filter(([, query]: any) => query instanceof type);

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('PolycentricClient live sync', () => {
  const seeded = makeStream({
    signer: signerA,
    identity: identityA,
    collection: COLLECTION.FEED,
    count: 1,
    label: 'seeded',
  });
  const content = makeContent('from another device');
  const remote = makeSignedEvent({
    signer: signerA,
    identity: identityA,
    collection: COLLECTION.FEED,
    sequence: 2,
    content,
  });

  it('pulls past the local heads when a server is ahead', async () => {
    const { core, emitHeads } = makeLiveCore(
      { pullBundles: () => [makeBundle(remote, content)] },
      [keyOf(seeded[0])],
    );
    const { client, stored } = await makeClient({
      core,
      identity: identityA,
      signer: signerA,
      events: seeded,
    });

    const stop = client.startLiveSync();
    emitHeads([keyOf(remote)]);

    await vi.waitFor(async () =>
      expect((await stored(remote))?.signedEvent).toEqual(remote),
    );
    expect(queriesOf(core, Query.ListEvents)[0][1].inner[0].heads).toEqual([
      expect.objectContaining({ sequence: 1n }),
    ]);
    stop();
  });

  it('refreshes when another tab already stored the events', async () => {
    const { core, emitHeads } = makeLiveCore(
      { pullBundles: () => [makeBundle(remote, content)] },
      [keyOf(seeded[0])],
    );
    const { client } = await makeClient({
      core,
      identity: identityA,
      signer: signerA,
      events: [...seeded, remote],
    });
    const pulled = vi.fn();
    client.events.onPulled(pulled);

    const stop = client.startLiveSync();
    emitHeads([keyOf(remote)]);

    await vi.waitFor(() => expect(pulled).toHaveBeenCalledWith(identityA.key));
    stop();
  });

  it('does not pull when up to date', async () => {
    const { core, emitHeads } = makeLiveCore({}, [keyOf(remote)]);
    const { client } = await makeClient({
      core,
      identity: identityA,
      signer: signerA,
      events: [...seeded, remote],
    });

    const stop = client.startLiveSync();
    emitHeads([keyOf(remote)]);
    await settle();

    expect(queriesOf(core, Query.ListEvents)).toHaveLength(0);
    stop();
  });

  it('pulls from the stored heads when the core cached newer events', async () => {
    // The core cached `remote` (e.g. from viewing our own profile) but it was
    // never persisted, so pulling past the core's head would leave a gap.

    const { core, emitHeads } = makeLiveCore(
      { pullBundles: () => [makeBundle(remote, content)] },
      [keyOf(remote)],
    );

    const { client, stored } = await makeClient({
      core,
      identity: identityA,
      signer: signerA,
      events: seeded,
    });

    const stop = client.startLiveSync();
    emitHeads([keyOf(remote)]);

    await vi.waitFor(async () =>
      expect((await stored(remote))?.signedEvent).toEqual(remote),
    );

    expect(queriesOf(core, Query.ListEvents)[0][1].inner[0].heads).toEqual([
      expect.objectContaining({ sequence: 1n }),
    ]);

    stop();
  });

  it('pulls from the core heads when storage is ahead of the core', async () => {
    // If another tab created an event, it would be in storage but not copied
    // to our rs-core.

    const { core, emitHeads } = makeLiveCore(
      { pullBundles: () => [makeBundle(remote, content)] },
      [keyOf(seeded[0])],
    );

    const { client } = await makeClient({
      core,
      identity: identityA,
      signer: signerA,
      events: [...seeded, remote],
    });

    const stop = client.startLiveSync();
    emitHeads([keyOf(remote)]);

    await vi.waitFor(() =>
      expect(queriesOf(core, Query.ListEvents)).toHaveLength(1),
    );

    expect(queriesOf(core, Query.ListEvents)[0][1].inner[0].heads).toEqual([
      expect.objectContaining({ sequence: 1n }),
    ]);

    stop();
  });

  it('follows identity switches and stops when asked', async () => {
    const { core, unsubscribe } = makeLiveCore();
    const { client } = await makeClient({
      core,
      identity: identityA,
      signer: signerA,
    });

    const stop = client.startLiveSync();
    client.activeIdentityKey = identityB.key;
    client.events.emitKeyPairChanged(null);

    const subscriptions = queriesOf(core, Query.SubscribeHeads);
    expect(subscriptions.map(([queryKey]) => queryKey)).toEqual([
      ['heads', identityA.key],
      ['heads', identityB.key],
    ]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    client.events.emitKeyPairChanged(null);
    expect(queriesOf(core, Query.SubscribeHeads)).toHaveLength(2);
  });
});

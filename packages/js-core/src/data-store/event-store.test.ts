import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorageDriver } from '../memory-storage';
import {
  type EventKey,
  EventRepositoryError,
  type EventRepositoryErrorCode,
  type IEventRepository,
} from '../platform-interfaces/event-repository';
import * as Proto from '../proto/v2';
import { EventStore } from './event-store';

const OWNER = 'ab'.repeat(32);
const BAD_OWNER = 'not an identity';

const privateKey = new Uint8Array(32).fill(1);
const signedBy = Proto.PublicKey.create({
  keyType: Proto.KeyType.ED25519,
  key: ed25519.getPublicKey(privateKey),
});

const content = new TextEncoder().encode('content');
const tampered = new TextEncoder().encode('tampered');

type EventArgs = {
  sequence?: number;
  contentDigest?: Proto.ContentDigest | null;
  signedBy?: Proto.PublicKey;
  createdAt?: number;
};

function makeEventKey(args: EventArgs = {}): EventKey {
  return {
    collection: 2,
    identity: OWNER,
    signedBy: args.signedBy ?? signedBy,
    sequence: BigInt(args.sequence ?? 1),
  };
}

function makeEvent(args: EventArgs = {}): Proto.SignedEvent {
  const contentDigest =
    args.contentDigest === null
      ? undefined
      : (args.contentDigest ?? {
          type: Proto.ContentDigestType.SHA256,
          value: sha256(content),
        });
  const eventBytes = Proto.Event.toBinary(
    Proto.Event.create({
      key: makeEventKey(args),
      contentDigest,
      createdAt: BigInt(args.createdAt ?? 1),
    }),
  );
  return {
    eventBytes,
    signature: ed25519.sign(eventBytes, privateKey),
  };
}

async function codeOf(
  promise: Promise<unknown>,
): Promise<EventRepositoryErrorCode | undefined> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(EventRepositoryError);
    return (err as EventRepositoryError).code;
  }
  return undefined;
}

describe('EventStore', () => {
  let repository: IEventRepository;
  let store: EventStore;

  beforeEach(() => {
    repository = new MemoryStorageDriver().createEventRepository();
    store = new EventStore(repository);
  });

  describe('owner validation', () => {
    const key = makeEventKey();
    const event = makeEvent();

    it.each([
      ['create', () => store.create(BAD_OWNER, event, content)],
      ['persist', () => store.persist(BAD_OWNER, event, content)],
      ['addContent', () => store.addContent(BAD_OWNER, key, content)],
      ['deleteContent', () => store.deleteContent(BAD_OWNER, key)],
      ['get', () => store.get(BAD_OWNER, key)],
      ['getAll', () => store.getAll(BAD_OWNER)],
      ['getHeads', () => store.getHeads(BAD_OWNER)],
    ])('%s rejects an invalid owner', async (_, call) => {
      expect(await codeOf(call())).toBe('invalid owner');
    });
  });

  describe('event decoding', () => {
    it('rejects malformed event bytes', async () => {
      const event = {
        eventBytes: new Uint8Array([0xff, 0xff, 0xff, 0xff]),
        signature: new Uint8Array(64),
      };
      expect(await codeOf(store.persist(OWNER, event))).toBe('invalid event');
    });

    it('rejects an event without a content digest', async () => {
      const event = makeEvent({ contentDigest: null });
      expect(await codeOf(store.persist(OWNER, event))).toBe('invalid event');
      expect(await codeOf(store.create(OWNER, event, content))).toBe(
        'invalid event',
      );
    });
  });

  describe('unsupported digest type', () => {
    const unsupported = {
      contentDigest: {
        type: Proto.ContentDigestType.UNSPECIFIED,
        value: sha256(content),
      },
    };

    it('rejects content in persist', async () => {
      expect(
        await codeOf(store.persist(OWNER, makeEvent(unsupported), content)),
      ).toBe('unsupported hash');
      expect(await store.getAll(OWNER)).toEqual([]);
    });

    it('rejects content in addContent', async () => {
      await store.persist(OWNER, makeEvent(unsupported));

      expect(
        await codeOf(store.addContent(OWNER, makeEventKey(), content)),
      ).toBe('unsupported hash');
    });
  });

  describe('persist', () => {
    it('stores a valid event with its content', async () => {
      await store.persist(OWNER, makeEvent(), content);

      const row = await store.get(OWNER, makeEventKey());
      expect(row?.contentStatus).toBe('present');
      expect(row?.contentBytes).toEqual(content);
    });

    it('stores a valid event without content as absent', async () => {
      await store.persist(OWNER, makeEvent());

      const row = await store.get(OWNER, makeEventKey());
      expect(row?.contentStatus).toBe('absent');
    });

    it('rejects an invalid signature', async () => {
      const event = makeEvent();
      const signature = event.signature.slice();
      signature[0] ^= 1;

      expect(
        await codeOf(store.persist(OWNER, { ...event, signature }, content)),
      ).toBe('invalid signature');
      expect(await store.getAll(OWNER)).toEqual([]);
    });

    it('rejects a malformed signature', async () => {
      const event = { ...makeEvent(), signature: new Uint8Array([1]) };

      expect(await codeOf(store.persist(OWNER, event, content))).toBe(
        'invalid signature',
      );
    });

    it('rejects an unsupported key type', async () => {
      const event = makeEvent({
        signedBy: { ...signedBy, keyType: Proto.KeyType.UNSPECIFIED },
      });

      expect(await codeOf(store.persist(OWNER, event, content))).toBe(
        'unsupported key type',
      );
    });

    it('rejects content that does not match the digest', async () => {
      expect(await codeOf(store.persist(OWNER, makeEvent(), tampered))).toBe(
        'invalid content',
      );
      expect(await store.getAll(OWNER)).toEqual([]);
    });
  });

  describe('addContent', () => {
    it('adds matching content', async () => {
      await store.persist(OWNER, makeEvent());
      await store.addContent(OWNER, makeEventKey(), content);

      const row = await store.get(OWNER, makeEventKey());
      expect(row?.contentStatus).toBe('present');
      expect(row?.contentBytes).toEqual(content);
    });

    it('rejects content that does not match the digest', async () => {
      await store.persist(OWNER, makeEvent());

      expect(
        await codeOf(store.addContent(OWNER, makeEventKey(), tampered)),
      ).toBe('invalid content');
      const row = await store.get(OWNER, makeEventKey());
      expect(row?.contentStatus).toBe('absent');
    });

    it('rejects a missing event', async () => {
      expect(
        await codeOf(store.addContent(OWNER, makeEventKey(), content)),
      ).toBe('not found');
    });
  });
});

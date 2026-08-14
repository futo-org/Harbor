import type {
  IContentRepository,
  IEventAckRepository,
  IEventRepository,
  IFileStoreDriver,
  IKeysRepository,
  IStorageDriver,
} from './platform-interfaces';
import type { PrivateKey } from './polycentric-client';
import * as Proto from './proto/v2';
import { bytesToHex, toDigestKey } from './utils/hex';

/** Canonical string identity of an EventKey, used as the store's map key. */
function eventKeyString(key: Proto.EventKey): string {
  return `${key.collection}|${key.identity}|${
    key.signedBy
      ? `${key.signedBy.keyType}:${bytesToHex(key.signedBy.key)}`
      : '?'
  }|${key.sequence}`;
}

class MemoryEventRepository implements IEventRepository {
  private readonly map = new Map<string, Proto.SignedEvent>();

  async save(
    signedEvents: Proto.SignedEvent | Proto.SignedEvent[],
  ): Promise<void> {
    const list = Array.isArray(signedEvents) ? signedEvents : [signedEvents];
    for (const signedEvent of list) {
      const event = Proto.Event.fromBinary(signedEvent.eventBytes);
      if (!event.key) continue;
      this.map.set(eventKeyString(event.key), signedEvent);
    }
  }

  async getAll(): Promise<Proto.SignedEvent[]> {
    return [...this.map.values()];
  }

  async getBatch(
    batchSize: number,
    offset = 0,
  ): Promise<{ events: Proto.SignedEvent[]; offset: number }> {
    const all = [...this.map.values()];
    const events = all.slice(offset, offset + batchSize);
    return { events, offset: offset + events.length };
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
      .filter(({ event }) => event.key?.identity === identity);

    if (options?.signer) {
      const wanted = bytesToHex(options.signer.key);
      events = events.filter(
        ({ event }) =>
          event.key?.signedBy && bytesToHex(event.key.signedBy.key) === wanted,
      );
    }
    if (options?.collection != null) {
      events = events.filter(
        ({ event }) => event.key?.collection === options.collection,
      );
    }

    if (options?.headsOnly) {
      // One head (max sequence) per (collection, signer) stream.
      const heads = new Map<string, { se: Proto.SignedEvent; seq: bigint }>();
      for (const { se, event } of events) {
        if (!event.key?.signedBy) continue;
        const stream = `${event.key.collection}|${bytesToHex(
          event.key.signedBy.key,
        )}`;
        const seq = event.key.sequence;
        const cur = heads.get(stream);
        if (!cur || seq > cur.seq) heads.set(stream, { se, seq });
      }
      return [...heads.values()].map((h) => h.se);
    }

    return events
      .sort((a, b) =>
        Number((a.event.key?.sequence ?? 0n) - (b.event.key?.sequence ?? 0n)),
      )
      .map(({ se }) => se);
  }
}

class MemoryContentRepository implements IContentRepository {
  private readonly map = new Map<
    string,
    { digest: Proto.ContentDigest; content: Proto.Content }
  >();

  async save(
    digest: Proto.ContentDigest,
    content: Proto.Content,
  ): Promise<void> {
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

type StoredKeyPair = { privateKey: PrivateKey; publicKey: Proto.PublicKey };

function publicKeyString(publicKey: Proto.PublicKey): string {
  return `${publicKey.keyType}:${bytesToHex(publicKey.key)}`;
}

class MemoryKeysRepository implements IKeysRepository {
  private readonly map = new Map<string, StoredKeyPair>();

  async storeKeys(keys: StoredKeyPair): Promise<void> {
    this.map.set(publicKeyString(keys.publicKey), keys);
  }

  async retrieveKeysByPublicKey(
    publicKey: Proto.PublicKey,
  ): Promise<StoredKeyPair | null> {
    return this.map.get(publicKeyString(publicKey)) ?? null;
  }

  async removeKeys(publicKey: Proto.PublicKey): Promise<void> {
    this.map.delete(publicKeyString(publicKey));
  }

  async getAllKeys(): Promise<StoredKeyPair[]> {
    return [...this.map.values()];
  }
}

class MemoryEventAckRepository implements IEventAckRepository {
  private readonly map = new Map<string, Set<string>>();

  private static key(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
  ): string {
    return `${systemKeyType}|${bytesToHex(systemKey)}|${bytesToHex(process)}|${sequence}`;
  }

  async storeEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
    serverUrl: string,
  ): Promise<void> {
    const key = MemoryEventAckRepository.key(
      systemKeyType,
      systemKey,
      process,
      sequence,
    );
    const acks = this.map.get(key) ?? new Set<string>();
    acks.add(serverUrl);
    this.map.set(key, acks);
  }

  async getEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
  ): Promise<string[]> {
    return [
      ...(this.map.get(
        MemoryEventAckRepository.key(
          systemKeyType,
          systemKey,
          process,
          sequence,
        ),
      ) ?? []),
    ];
  }

  async hasEventAck(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
    serverUrl: string,
  ): Promise<boolean> {
    return (
      this.map
        .get(
          MemoryEventAckRepository.key(
            systemKeyType,
            systemKey,
            process,
            sequence,
          ),
        )
        ?.has(serverUrl) ?? false
    );
  }

  async removeEventAcks(
    systemKeyType: bigint,
    systemKey: Uint8Array,
    process: Uint8Array,
    sequence: bigint,
  ): Promise<void> {
    this.map.delete(
      MemoryEventAckRepository.key(systemKeyType, systemKey, process, sequence),
    );
  }
}

/**
 * Storage driver that keeps everything in process memory. Nothing survives
 * a reload — for contexts where durable storage is unavailable (e.g.
 * private browsing blocking IndexedDB).
 */
export class MemoryStorageDriver implements IStorageDriver {
  private readonly events = new MemoryEventRepository();
  private readonly contents = new MemoryContentRepository();
  private readonly keys = new MemoryKeysRepository();
  private readonly eventAcks = new MemoryEventAckRepository();
  private readonly activeIdentityKeys = new Map<string, string>();

  createEventRepository() {
    return this.events;
  }
  createContentRepository() {
    return this.contents;
  }
  createKeysRepository() {
    return this.keys;
  }
  createEventAckRepository() {
    return this.eventAcks;
  }

  async saveActiveIdentityKey(
    publicKey: Uint8Array,
    identityKey: string | null,
  ): Promise<void> {
    const key = bytesToHex(publicKey);
    if (identityKey) {
      this.activeIdentityKeys.set(key, identityKey);
    } else {
      this.activeIdentityKeys.delete(key);
    }
  }

  async loadActiveIdentityKey(publicKey: Uint8Array): Promise<string | null> {
    return this.activeIdentityKeys.get(bytesToHex(publicKey)) ?? null;
  }
}

/** In-memory counterpart of the blob file store. */
export class MemoryFileStoreDriver implements IFileStoreDriver {
  private readonly map = new Map<string, Uint8Array>();

  async has(digest: Proto.ContentDigest): Promise<boolean> {
    return this.map.has(toDigestKey(digest));
  }

  async get(digest: Proto.ContentDigest): Promise<Uint8Array | null> {
    return this.map.get(toDigestKey(digest)) ?? null;
  }

  async put(digest: Proto.ContentDigest, bytes: Uint8Array): Promise<void> {
    this.map.set(toDigestKey(digest), bytes);
  }

  async delete(digest: Proto.ContentDigest): Promise<void> {
    this.map.delete(toDigestKey(digest));
  }
}

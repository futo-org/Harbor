import type { IEventRepository } from '@polycentric/js-core';
import { v2 } from '@polycentric/js-core';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function publicKeyHex(publicKey: v2.PublicKey): string {
  return bytesToHex(v2.PublicKey.toBinary(publicKey));
}

function eventCompoundKey(
  publicKey: string,
  collection: number,
  identity: string,
  sequence: number
): string {
  return `${publicKey}:${collection}:${identity}:${sequence}`;
}

/**
 * In-memory v2 event repository for React Native.
 * TODO: persist to SQLite once the v2 schema migration is in place.
 */
export class EventRepository implements IEventRepository {
  private events = new Map<string, v2.SignedEvent>();

  private extractKey(signedEvent: v2.SignedEvent) {
    const event = v2.Event.fromBinary(signedEvent.eventBytes);
    if (!event.key?.signedBy) throw new Error('Event missing key');
    return {
      publicKey: publicKeyHex(event.key.signedBy),
      collection: event.key.collection,
      identity: event.key.identity,
      sequence: Number(event.key.sequence),
    };
  }

  async save(signedEvent: v2.SignedEvent): Promise<void> {
    const { publicKey, collection, identity, sequence } =
      this.extractKey(signedEvent);
    this.events.set(
      eventCompoundKey(publicKey, collection, identity, sequence),
      signedEvent
    );
  }

  async getAll(): Promise<v2.SignedEvent[]> {
    return [...this.events.values()];
  }

  async getBatch(
    batchSize: number,
    offset = 0
  ): Promise<{ events: v2.SignedEvent[]; offset: number }> {
    const all = [...this.events.values()];
    const slice = all.slice(offset, offset + batchSize);
    return { events: slice, offset: offset + slice.length };
  }

  async getNextSequence(
    publicKey: v2.PublicKey,
    collection: number,
    identity: string
  ): Promise<bigint> {
    const prefix = `${publicKeyHex(publicKey)}:${collection}:${identity}:`;
    let max = 0n;
    for (const key of this.events.keys()) {
      if (key.startsWith(prefix)) {
        const seq = BigInt(key.slice(prefix.length));
        if (seq >= max) max = seq + 1n;
      }
    }
    return max === 0n ? 1n : max;
  }

  async getLatestEvent(
    publicKey: v2.PublicKey,
    identity: string
  ): Promise<v2.SignedEvent | null> {
    const pkHex = publicKeyHex(publicKey);
    let latest: v2.SignedEvent | null = null;
    let maxSeq = -1;
    for (const [key, event] of this.events) {
      const parts = key.split(':');
      if (parts[0] !== pkHex || parts[2] !== identity) continue;
      const seq = Number(parts[3]);
      if (seq > maxSeq) {
        maxSeq = seq;
        latest = event;
      }
    }
    return latest;
  }

  async getEventsByIdentity(
    publicKey: v2.PublicKey,
    identity: string
  ): Promise<v2.SignedEvent[]> {
    const pkHex = publicKeyHex(publicKey);
    const result: { seq: number; event: v2.SignedEvent }[] = [];
    for (const [key, event] of this.events) {
      const parts = key.split(':');
      if (parts[0] !== pkHex || parts[2] !== identity) continue;
      result.push({ seq: Number(parts[3]), event });
    }
    result.sort((a, b) => a.seq - b.seq);
    return result.map((r) => r.event);
  }
}

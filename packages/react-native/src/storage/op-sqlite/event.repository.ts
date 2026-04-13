import type { IEventRepository } from '@polycentric/js-core';
import { v2 } from '@polycentric/js-core';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function eventCompoundKey(
  publicKey: string,
  identity: string,
  sequence: number
): string {
  return `${publicKey}:${identity}:${sequence}`;
}

/**
 * In-memory v2 event repository for React Native.
 * TODO: persist to SQLite once the v2 schema migration is in place.
 */
export class EventRepository implements IEventRepository {
  private events = new Map<string, v2.SignedEvent>();

  private extractKey(signedEvent: v2.SignedEvent) {
    const event = v2.Event.fromBinary(signedEvent.eventBytes);
    if (!event.key?.signedBy?.key) throw new Error('Event missing key');
    return {
      publicKey: bytesToHex(event.key.signedBy.key),
      identity: event.key.identity,
      sequence: Number(event.key.sequence),
    };
  }

  async save(signedEvent: v2.SignedEvent): Promise<void> {
    const { publicKey, identity, sequence } = this.extractKey(signedEvent);
    this.events.set(
      eventCompoundKey(publicKey, identity, sequence),
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
    publicKey: Uint8Array,
    collection: number,
    identity: string
  ): Promise<bigint> {
    const prefix = `${bytesToHex(publicKey)}:${collection}:${identity}:`;
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
    publicKey: Uint8Array,
    identity: string
  ): Promise<v2.SignedEvent | null> {
    const prefix = `${bytesToHex(publicKey)}:${identity}:`;
    let latest: v2.SignedEvent | null = null;
    let maxSeq = -1;
    for (const [key, event] of this.events) {
      if (key.startsWith(prefix)) {
        const seq = Number(key.slice(prefix.length));
        if (seq > maxSeq) {
          maxSeq = seq;
          latest = event;
        }
      }
    }
    return latest;
  }

  async getEventsByIdentity(
    publicKey: Uint8Array,
    identity: string
  ): Promise<v2.SignedEvent[]> {
    const prefix = `${bytesToHex(publicKey)}:${identity}:`;
    const result: { seq: number; event: v2.SignedEvent }[] = [];
    for (const [key, event] of this.events) {
      if (key.startsWith(prefix)) {
        result.push({ seq: Number(key.slice(prefix.length)), event });
      }
    }
    result.sort((a, b) => a.seq - b.seq);
    return result.map((r) => r.event);
  }
}

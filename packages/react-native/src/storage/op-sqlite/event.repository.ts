import type { IEventRepository } from '@polycentric/js-core';
import { v2 } from '@polycentric/js-core';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Stable string identity for an EventKey: hex-encoded canonical proto bytes.
 * Used as the in-memory Map key.
 */
function eventKeyId(key: v2.EventKey): string {
  return bytesToHex(v2.EventKey.toBinary(key));
}

interface StoredEvent {
  key: v2.EventKey;
  signedEvent: v2.SignedEvent;
}

/**
 * In-memory v2 event repository for React Native.
 * TODO: persist to SQLite once the v2 schema migration is in place.
 */
export class EventRepository implements IEventRepository {
  private events = new Map<string, StoredEvent>();

  async save(signedEvent: v2.SignedEvent): Promise<void> {
    const event = v2.Event.fromBinary(signedEvent.eventBytes);
    if (!event.key) throw new Error('Event missing key');
    this.events.set(eventKeyId(event.key), { key: event.key, signedEvent });
  }

  async getAll(): Promise<v2.SignedEvent[]> {
    return [...this.events.values()].map((e) => e.signedEvent);
  }

  async getBatch(
    batchSize: number,
    offset = 0
  ): Promise<{ events: v2.SignedEvent[]; offset: number }> {
    const all = await this.getAll();
    const slice = all.slice(offset, offset + batchSize);
    return { events: slice, offset: offset + slice.length };
  }

  async getByEventKey(key: v2.EventKey): Promise<v2.SignedEvent | null> {
    return this.events.get(eventKeyId(key))?.signedEvent ?? null;
  }

  async getByIdentity(
    identity: string,
    options?: {
      signer?: v2.PublicKey;
      collection?: number;
      headsOnly?: boolean;
    }
  ): Promise<v2.SignedEvent[]> {
    const signerHex = options?.signer
      ? bytesToHex(v2.PublicKey.toBinary(options.signer))
      : undefined;

    const matches: StoredEvent[] = [];
    for (const stored of this.events.values()) {
      const k = stored.key;
      if (k.identity !== identity) continue;
      if (
        options?.collection !== undefined &&
        k.collection !== options.collection
      )
        continue;
      if (signerHex !== undefined) {
        if (!k.signedBy) continue;
        if (bytesToHex(v2.PublicKey.toBinary(k.signedBy)) !== signerHex)
          continue;
      }
      matches.push(stored);
    }

    if (options?.headsOnly) {
      // Keep only the max-sequence entry per (signer, collection).
      const heads = new Map<string, StoredEvent>();
      for (const m of matches) {
        if (!m.key.signedBy) continue;
        const groupId = `${bytesToHex(v2.PublicKey.toBinary(m.key.signedBy))}:${m.key.collection}`;
        const existing = heads.get(groupId);
        if (!existing || m.key.sequence > existing.key.sequence) {
          heads.set(groupId, m);
        }
      }
      return [...heads.values()].map((m) => m.signedEvent);
    }

    matches.sort((a, b) => Number(a.key.sequence - b.key.sequence));
    return matches.map((m) => m.signedEvent);
  }
}

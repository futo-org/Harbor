import type { Database } from './database';
import {
  ContentType,
  Delete,
  Event,
  Pointer,
  SignedEvent,
  type IEventRepository,
} from '@polycentric/js-core';

export class EventRepository implements IEventRepository {
  constructor(private readonly database: Database) {}

  async persistEvent(signedEvent: SignedEvent): Promise<void> {
    const rawEventBytes = signedEvent.event;
    const event = Event.fromBinary(rawEventBytes);

    const systemKeyType = Number(event.system?.keyType ?? 0n);
    const systemKey = event.system?.key ?? new Uint8Array();
    const process = event.process?.process ?? new Uint8Array();
    const logicalClock = Number(event.logicalClock ?? 0n);

    const signature = signedEvent.signature;
    const rawEvent = rawEventBytes;
    const moderationTags =
      signedEvent.moderationTags.length > 0
        ? JSON.stringify(signedEvent.moderationTags)
        : null;

    const isTombstone = event.contentType === ContentType.DELETE;

    let mutationPointerSystemKeyType: number | null = null;
    let mutationPointerSystemKey: Uint8Array | null = null;
    let mutationPointerProcess: Uint8Array | null = null;
    let mutationPointerLogicalClock: number | null = null;

    if (isTombstone) {
      try {
        const deleteEvent = Delete.fromBinary(event.content);

        if (deleteEvent.process && deleteEvent.logicalClock) {
          mutationPointerProcess = deleteEvent.process.process ?? null;
          mutationPointerLogicalClock = Number(deleteEvent.logicalClock);

          if (event.references.length > 0) {
            const targetPointer = Pointer.fromBinary(
              event.references[0]!.reference
            );
            if (targetPointer.system) {
              mutationPointerSystemKeyType = Number(
                targetPointer.system.keyType
              );
              mutationPointerSystemKey = targetPointer.system.key ?? null;
            }
          }
        }
      } catch (error) {
        console.warn('Failed to parse delete event content:', error);
      }
    }

    this.database.run(
      `INSERT OR IGNORE INTO events (
        system_key_type, system_key, process, logical_clock,
        signature, raw_event, moderation_tags,
        is_tombstone, mutation_pointer_system_key_type,
        mutation_pointer_system_key, mutation_pointer_process,
        mutation_pointer_logical_clock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        systemKeyType,
        systemKey,
        process,
        logicalClock,
        signature,
        rawEvent,
        moderationTags,
        isTombstone ? 1 : 0,
        mutationPointerSystemKeyType,
        mutationPointerSystemKey,
        mutationPointerProcess,
        mutationPointerLogicalClock,
      ]
    );
  }

  async persistEvents(signedEvents: SignedEvent[]): Promise<void> {
    for (const signedEvent of signedEvents) {
      await this.persistEvent(signedEvent);
    }
  }

  async getAllEvents(): Promise<SignedEvent[]> {
    const results = this.database.execute<{
      signature: ArrayBuffer;
      raw_event: ArrayBuffer;
      moderation_tags: string | null;
    }>('SELECT signature, raw_event, moderation_tags FROM events');

    return results.map((row) =>
      SignedEvent.create({
        signature: new Uint8Array(row.signature),
        event: new Uint8Array(row.raw_event),
        moderationTags: row.moderation_tags
          ? JSON.parse(row.moderation_tags)
          : [],
      })
    );
  }

  async getEventsBatch(
    batchSize: number,
    offset = 0
  ): Promise<{ events: SignedEvent[]; offset: number }> {
    const results = this.database.execute<{
      signature: ArrayBuffer;
      raw_event: ArrayBuffer;
      moderation_tags: string | null;
    }>(
      `SELECT signature, raw_event, moderation_tags
       FROM events
       ORDER BY id
       LIMIT ? OFFSET ?`,
      [batchSize, offset]
    );

    return {
      events: results.map((row) =>
        SignedEvent.create({
          signature: new Uint8Array(row.signature),
          event: new Uint8Array(row.raw_event),
          moderationTags: row.moderation_tags
            ? JSON.parse(row.moderation_tags)
            : [],
        })
      ),
      offset: offset + results.length,
    };
  }
}

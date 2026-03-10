import type { Database } from '../database';
import { polycentric as proto } from '../../generated/protocol';

export class EventRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  persistEvent(signedEvent: proto.ISignedEvent): void {
    const rawEventBytes = signedEvent.event!;

    const event = proto.Event.decode(rawEventBytes);

    const systemKeyType = Number(event.system?.keyType ?? 0);
    const systemKey = event.system?.key ?? new Uint8Array();
    const process = event.process?.process ?? new Uint8Array();
    const logicalClock =
      typeof event.logicalClock === 'number'
        ? event.logicalClock
        : Number(event.logicalClock);

    const signature = signedEvent.signature!;
    const rawEvent = rawEventBytes;
    const moderationTags =
      signedEvent.moderationTags && signedEvent.moderationTags.length > 0
        ? JSON.stringify(signedEvent.moderationTags)
        : null;

    const isTombstone = event.contentType === proto.ContentType.DELETE;

    let mutationPointerSystemKeyType: number | null = null;
    let mutationPointerSystemKey: Uint8Array | null = null;
    let mutationPointerProcess: Uint8Array | null = null;
    let mutationPointerLogicalClock: number | null = null;

    if (isTombstone) {
      try {
        const deleteEvent = proto.Delete.decode(event.content);

        if (deleteEvent.process && deleteEvent.logicalClock) {
          mutationPointerProcess = deleteEvent.process.process ?? null;
          mutationPointerLogicalClock =
            typeof deleteEvent.logicalClock === 'number'
              ? deleteEvent.logicalClock
              : Number(deleteEvent.logicalClock);

          if (event.references && event.references.length > 0) {
            const targetPointer = proto.Pointer.decode(
              event.references[0]!.reference!
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

  persistEvents(signedEvents: proto.ISignedEvent[]): void {
    for (const event of signedEvents) {
      this.persistEvent(event);
    }
  }

  getAllEvents(): proto.SignedEvent[] {
    const results = this.database.execute<{
      signature: ArrayBuffer;
      raw_event: ArrayBuffer;
      moderation_tags: string | null;
    }>('SELECT signature, raw_event, moderation_tags FROM events');

    return results.map((row) => {
      return proto.SignedEvent.create({
        signature: new Uint8Array(row.signature),
        event: new Uint8Array(row.raw_event),
        moderationTags: row.moderation_tags
          ? JSON.parse(row.moderation_tags)
          : [],
      });
    });
  }
}

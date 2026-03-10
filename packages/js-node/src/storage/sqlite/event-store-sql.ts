import type { IEventRepository } from '@polycentric/js-core';
import {
  SignedEvent,
  DatabaseError,
  Event,
  ContentType,
  Pointer,
  Delete,
} from '@polycentric/js-core';
import { NodeSQLiteDatabase } from './sqlite-database';

/**
 * EventRepository provides SQL-based storage for polycentric signed events.
 */
export class SQLEventRepository implements IEventRepository {
  private readonly database: NodeSQLiteDatabase;

  /**
   * Create a new SQLEventRepository instance
   *
   * @param database - Database instance
   */
  constructor(database: NodeSQLiteDatabase) {
    this.database = database;
  }

  /**
   * Persist a single event in the database.
   *
   * @param signedEvent - A signed event to persist
   * @throws {DatabaseError} If the event is invalid or persisting fails
   */
  async persistEvent(signedEvent: SignedEvent): Promise<void> {
    try {
      const event = Event.fromBinary(signedEvent.event);

      const systemKeyType = event.system?.keyType ?? BigInt(0);
      const systemKey = event.system?.key ?? new Uint8Array();
      const process = event.process?.process ?? new Uint8Array();
      const logicalClock = event.logicalClock;

      const signature = signedEvent.signature;
      const rawEvent = signedEvent.event;
      const moderationTags =
        signedEvent.moderationTags.length > 0
          ? JSON.stringify(signedEvent.moderationTags)
          : null;

      const isTombstone = event.contentType === ContentType.DELETE;

      let mutationPointerSystemKeyType: number | null = null;
      let mutationPointerSystemKey: Uint8Array | null = null;
      let mutationPointerProcess: Uint8Array | null = null;
      let mutationPointerLogicalClock: bigint | null = null;

      if (isTombstone) {
        try {
          const deleteEvent = Delete.fromBinary(event.content);

          if (deleteEvent.process && deleteEvent.logicalClock) {
            mutationPointerProcess = deleteEvent.process.process;
            mutationPointerLogicalClock = deleteEvent.logicalClock;

            if (event.references && event.references.length > 0) {
              const targetPointer = Pointer.fromBinary(
                event.references[0].reference,
              );
              if (targetPointer.system) {
                mutationPointerSystemKeyType = Number(
                  targetPointer.system.keyType,
                );
                mutationPointerSystemKey = targetPointer.system.key;
              }
            }
          }
        } catch (error) {
          console.warn('Failed to parse delete event content:', error);
        }
      }

      await this.database.executeNonQuery(
        `INSERT INTO events (
          system_key_type, system_key, process, logical_clock,
          signature, raw_event, moderation_tags,
          is_tombstone, mutation_pointer_system_key_type, 
          mutation_pointer_system_key, mutation_pointer_process, 
          mutation_pointer_logical_clock
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          systemKeyType.toString(),
          systemKey,
          process,
          logicalClock.toString(),
          signature,
          rawEvent,
          moderationTags,
          isTombstone ? 1 : 0,
          mutationPointerSystemKeyType,
          mutationPointerSystemKey,
          mutationPointerProcess,
          mutationPointerLogicalClock
            ? mutationPointerLogicalClock.toString()
            : null,
        ],
      );
    } catch (error) {
      throw new DatabaseError('Failed to persist signed event: ', error);
    }
  }

  /**
   * Persist multiple events in a single database transaction.
   *
   * @param signedEvents - An array of signed events to persist
   * @throws {DatabaseError} If any event is invalid or the transaction fails
   */
  async persistEvents(signedEvents: SignedEvent[]): Promise<void> {
    throw new Error('Not implemented, cannot persist events: ' + signedEvents);
  }

  /**
   * Get all events from the repository
   *
   * @returns An array of signed events
   */
  async getAllEvents(): Promise<SignedEvent[]> {
    throw new Error('Not implemented, cannot get all events.');
  }

  getEventsBatch(): Promise<{ events: SignedEvent[]; offset: number }> {
    throw new Error('Not implemented, can not get event batch');
  }
}

/**
 * Create a new SQLEventRepository with an initialized database.
 *
 * This method creates a standalone event repository. It allows for
 * simpler isolation for testing purposes.
 *
 * This method should not be used in practice.
 * In practice create a BrowserStorage instance.
 *
 * @param database - Database instance for storing events
 * @returns Promise that resolves to an initialized SQLEventRepository
 * @throws {Error} If database initialization fails
 */
export async function _createSQLEventRepository(
  database: NodeSQLiteDatabase,
): Promise<SQLEventRepository> {
  await database.initialize();
  return new SQLEventRepository(database);
}

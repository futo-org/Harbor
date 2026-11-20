import type * as Proto from '../proto/v2';

export type EventKey = Required<Proto.EventKey>;

export type ContentStatus =
  /** We have this content. */
  | 'present'
  /** We want this content but do not have it. */
  | 'absent'
  /** We have chosen not to persist this content. */
  | 'omitted';

/** Persisted event/content fields. */
export type EventRow = {
  owner: string;
  eventKey: EventKey;
  eventBytes: Uint8Array;
  eventSignature: Uint8Array;
  contentStatus: ContentStatus;
  contentBytes?: Uint8Array;
};

/**
 * Provides persistent storage for events and content.
 * Each platform should have an implementation for this interface.
 * Most callers should be interacting with the event store instead.
 *
 * Assume any function can throw unless specified otherwise.
 * Implementations should only throw instances of `EventRepositoryError`.
 */
export interface IEventRepository {
  /**
   * Persist a new event in the repository.
   * Throws an error if an event with the same event key already exists.
   * TODO: support replacing an event?
   */
  insert(row: EventRow): Promise<void>;

  /**
   * Persist the content for an event that we already have.
   */
  addContent(
    owner: string,
    eventKey: EventKey,
    serializedContent: Uint8Array,
  ): Promise<void>;

  /**
   * Delete content for an event.
   */
  deleteContent(owner: string, eventKey: EventKey): Promise<void>;

  /**
   * Look up a single event and its content by its event key.
   * Returns null if the event is not present.
   */
  get(owner: string, eventKey: EventKey): Promise<EventRow | null>;

  /**
   * Get all event/content for an owner.
   * Useful for seeding rs-core on startup.
   */
  getAll(owner: string): Promise<EventRow[]>;

  /**
   * List all persisted event keys meeting the following criteria:
   * 1. owned by `owner`.
   * 2. identity matches the owner.
   * 3. for all persisted event keys that meet the other criteria and have the
   *    same collection and signer, none of them have a higher sequence number
   *    than this one.
   *
   * Useful for syncing.
   */
  getHeads(owner: string): Promise<EventKey[]>;

  /**
   * Get all identity and profile events for each local identity (owner).
   * Useful for hydrating rs-core for the identity switcher.
   */
  getProfiles(): Promise<EventRow[]>;
}

/**
 * Event repository implementations should use these error codes.
 * Implementations may fall back to `'db'` even when a more specific error code
 * is applicable.
 */
export type EventRepositoryErrorCode =
  | 'invalid owner'
  | 'invalid event'
  | 'invalid content'
  | 'invalid status'
  | 'unsupported hash'
  | 'invalid signature'
  | 'unsupported key type'
  | 'already exists'
  | 'not found'
  /** Generic database error. */
  | 'db';

export class EventRepositoryError extends Error {
  override readonly name = 'EventRepositoryError';

  constructor(
    readonly code: EventRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

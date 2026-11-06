import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  type EventKey,
  EventRepositoryError,
  type EventRow,
  type IEventRepository,
} from '../platform-interfaces/event-repository';
import * as Proto from '../proto/v2';
import { bytesEqual } from '../utils/bytes';
import { assertIdentity } from './guards';

/**
 * EventStore wraps a platform's event repository with shared input validation.
 * All functions throw `EventRepositoryError` on failure.
 */
export class EventStore {
  constructor(private readonly repository: IEventRepository) {}

  /**
   * Try persisted a newly created event/content bundle.
   * This may fail if a concurrent session is also creating events.
   * This method does not do much validation since we trust that our client
   * created the event correctly.
   */
  async create(
    owner: string,
    event: Proto.SignedEvent,
    contentBytes: Uint8Array,
  ): Promise<void> {
    assertIdentity(owner, invalidOwner);
    const { eventKey } = decodeEvent(event);

    await this.repository.insert({
      owner,
      eventKey,
      eventBytes: event.eventBytes,
      eventSignature: event.signature,
      contentStatus: 'present',
      contentBytes,
    });
  }

  /**
   * Try persisting the event and/or content that we have received from a
   * remote source.
   * An existing event is never overwritten.
   */
  async persist(
    owner: string,
    event: Proto.SignedEvent,
    contentBytes?: Uint8Array,
  ): Promise<void> {
    assertIdentity(owner, invalidOwner);
    const { eventKey, contentDigest } = decodeEvent(event);

    const existing = await this.repository.get(owner, eventKey);
    if (!existing) {
      assertSignature(event, eventKey);
      if (contentBytes) assertContentMatches(contentDigest, contentBytes);

      await this.repository.insert({
        owner,
        eventKey,
        eventBytes: event.eventBytes,
        eventSignature: event.signature,
        contentStatus: contentBytes ? 'present' : 'absent',
        contentBytes,
      });
    } else if (contentBytes && existing.contentStatus === 'absent') {
      await this.addVerifiedContent(existing, contentBytes);
    }
  }

  /**
   * Persist content for an event that we already have.
   */
  async addContent(
    owner: string,
    eventKey: EventKey,
    serializedContent: Uint8Array,
  ): Promise<void> {
    assertIdentity(owner, invalidOwner);

    const existing = await this.repository.get(owner, eventKey);
    if (!existing) {
      throw new EventRepositoryError('not found', 'event not found');
    }

    await this.addVerifiedContent(existing, serializedContent);
  }

  async deleteContent(owner: string, eventKey: EventKey): Promise<void> {
    assertIdentity(owner, invalidOwner);
    await this.repository.deleteContent(owner, eventKey);
  }

  async get(owner: string, eventKey: EventKey): Promise<EventRow | null> {
    assertIdentity(owner, invalidOwner);
    return this.repository.get(owner, eventKey);
  }

  async getAll(owner: string): Promise<EventRow[]> {
    assertIdentity(owner, invalidOwner);
    return this.repository.getAll(owner);
  }

  async getHeads(owner: string): Promise<EventKey[]> {
    assertIdentity(owner, invalidOwner);
    return this.repository.getHeads(owner);
  }

  /**
   * Check that the content matches our stored digest and store it.
   * We assume that the stored event is immutable.
   */
  private async addVerifiedContent(
    existing: EventRow,
    contentBytes: Uint8Array,
  ): Promise<void> {
    const { contentDigest } = decodeEvent({
      eventBytes: existing.eventBytes,
      signature: existing.eventSignature,
    });

    assertContentMatches(contentDigest, contentBytes);

    await this.repository.addContent(
      existing.owner,
      existing.eventKey,
      contentBytes,
    );
  }
}

const invalidOwner = (message: string) =>
  new EventRepositoryError('invalid owner', message);

type DecodedEvent = {
  event: Proto.Event;
  eventKey: EventKey;
  contentDigest: Proto.ContentDigest;
};

/**
 * Decode a signed event and check that it has the fields we depend on.
 */
function decodeEvent(signedEvent: Proto.SignedEvent): DecodedEvent {
  let event: Proto.Event;
  try {
    event = Proto.Event.fromBinary(signedEvent.eventBytes);
  } catch (error) {
    throw new EventRepositoryError('invalid event', 'malformed event bytes', {
      cause: error,
    });
  }

  const key = event.key;
  if (!key?.signedBy) {
    throw new EventRepositoryError('invalid event', 'event key is incomplete');
  }

  const contentDigest = event.contentDigest;
  if (!contentDigest) {
    throw new EventRepositoryError('invalid event', 'missing content digest');
  }

  return {
    event,
    eventKey: { ...key, signedBy: key.signedBy },
    contentDigest,
  };
}

/**
 * Check that the event was signed by the key in its event key.
 */
function assertSignature(
  signedEvent: Proto.SignedEvent,
  eventKey: EventKey,
): void {
  const { keyType, key } = eventKey.signedBy;

  if (keyType !== Proto.KeyType.ED25519) {
    throw new EventRepositoryError(
      'unsupported key type',
      `unsupported key type: ${keyType}`,
    );
  }

  let valid: boolean;
  try {
    valid = ed25519.verify(signedEvent.signature, signedEvent.eventBytes, key);
  } catch (error) {
    throw new EventRepositoryError('invalid signature', 'malformed signature', {
      cause: error,
    });
  }

  if (!valid) {
    throw new EventRepositoryError(
      'invalid signature',
      'signature does not match event bytes',
    );
  }
}

/**
 * Check that the content bytes match a content digest.
 */
function assertContentMatches(
  digest: Proto.ContentDigest,
  contentBytes: Uint8Array,
): void {
  if (digest.type !== Proto.ContentDigestType.SHA256) {
    throw new EventRepositoryError(
      'unsupported hash',
      `unsupported content digest type: ${digest.type}`,
    );
  }

  if (!bytesEqual(sha256(contentBytes), digest.value)) {
    throw new EventRepositoryError(
      'invalid content',
      'content does not match event digest',
    );
  }
}

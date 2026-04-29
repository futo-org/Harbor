import { sha256 } from '@noble/hashes/sha2';
import type { ICryptoManager } from '../platform-interfaces/crypto-manager';
import * as Proto from '../proto/v2';
import { bytesEqual } from './bytes';

/**
 * Integrity check for an EventBundle.
 * Checks that the signature over event_bytes is valid for event.key.signed_by,
 * and (when content is attached) that sha256(serialized_content) matches
 * event.content_digest.
 *
 * This does NOT check:
 * - if signed_by is authorized to sign this event on this identity
 * - if the vector clocks are valid
 */
export async function verifyEventBundle(
  bundle: Proto.EventBundle,
  cryptoManager: ICryptoManager,
): Promise<boolean> {
  const signedEvent = bundle.signedEvent;
  if (!signedEvent) return false;

  const event = Proto.Event.fromBinary(signedEvent.eventBytes);
  const signedBy = event.key?.signedBy;
  if (!signedBy) return false;

  const signatureValid = await cryptoManager.verify(
    signedBy.key,
    signedEvent.eventBytes,
    signedEvent.signature,
    signedBy.keyType,
  );
  if (!signatureValid) return false;

  const serializedContent = bundle.serializedContent;
  if (serializedContent) {
    const digest = event.contentDigest;
    if (!digest) return false;
    const computed = sha256(serializedContent.contentBytes);
    if (!bytesEqual(computed, digest.value)) return false;
  }

  return true;
}

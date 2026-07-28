import { COLLECTION, type PolycentricClient, v2 } from '@polycentric/js-core';
import type { ClaimField } from './models.js';
import { Result } from './result.js';

// ─────────────────────────────────────────────────────────────────────────
// Verification-claim contract, shared with the app's platform loop-back flow
// (apps/polycentric .../hooks/useVerifyPlatformClaim.ts):
//   • SCHEMA_NAME  — all platform claims share ONE `VerificationSchema` (the
//                    app's "Platform" claim type); the schema name does NOT
//                    encode the platform. `requestVerify` only checks the
//                    claim uses this shared schema.
//   • field names  — verifiers address account fields by numeric index
//                    (key 0 = handle, key 1 = channel id, …); claims key them
//                    `account`, `account_id`, `field_2`, `field_3`, ….
//                    A claim also carries display metadata the verifiers
//                    don't proof-check: `platform` (the platform's route
//                    slug, checked against the verifier handling the claim)
//                    and `url` (the profile URL).
//   • expectedToken — the loop-back token a user puts in their profile. The
//                    app's loop-back link is `<app-url>/<identity key>`, so
//                    the token is the claim's `EventKey.identity`.
// ─────────────────────────────────────────────────────────────────────────

// The single schema shared by every platform verification claim.
export const SCHEMA_NAME = 'Platform';

export interface DecodedClaim {
  // The claim event, referenced by a VerificationVerify when we verify it.
  eventKey: v2.EventKey;
  // `VerificationSchema.name` — which verifier should handle this claim.
  schemaName: string;
  // Account fields keyed by the ordinal index the verifiers address.
  fields: ClaimField[];
  // The platform route slug the claim was made for, when recorded.
  platform?: string;
  // Loop-back token to look for in the claimant's profile.
  expectedToken: string;
}

/** Ordinal a schema field key addresses, or undefined for metadata fields. */
function fieldOrdinal(key: string): number | undefined {
  if (key === 'account') return 0;
  if (key === 'account_id') return 1;
  const match = /^field_(\d+)$/.exec(key);
  return match ? Number(match[1]) : undefined;
}

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(Buffer.from(hex, 'hex'));

/** Parse the hex-encoded `EventKey` id a client sends to reference its claim. */
export function parseClaimId(claimId: string): v2.EventKey | undefined {
  // Buffer.from(hex) silently drops invalid characters, so validate first,
  // then require the decoded key to actually identify an event.
  if (
    claimId.length === 0 ||
    claimId.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(claimId)
  ) {
    return undefined;
  }
  try {
    const key = v2.EventKey.fromBinary(hexToBytes(claimId));
    if (!key.identity || !key.signedBy) return undefined;
    return key;
  } catch {
    return undefined;
  }
}

/**
 * Fetch the verification claim at `eventKey` and decode it into the shape the
 * verifiers expect. Returns an error result when the event can't be found or
 * isn't a well-formed verification claim.
 */
export async function fetchClaim(
  client: PolycentricClient,
  eventKey: v2.EventKey,
): Promise<Result<DecodedClaim>> {
  const findBundle = async (attempt: number) => {
    const bundles = await client.listEvents({
      identity: eventKey.identity,
      collection: COLLECTION.VERIFICATIONS,
      // Unique key so each attempt queries the servers instead of a cache.
      queryKey: [
        'verifier-claim',
        eventKey.identity,
        eventKey.sequence.toString(),
        attempt.toString(),
        Date.now().toString(),
      ],
    });
    return bundles.find((b) => {
      if (!b.signedEvent) return false;
      try {
        const event = v2.Event.fromBinary(b.signedEvent.eventBytes);
        return event.key?.sequence === eventKey.sequence;
      } catch {
        return false;
      }
    });
  };

  // Clients verify right after publishing; retry while the claim propagates
  // to the servers the bot reads from.
  let bundle: v2.EventBundle | undefined;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      bundle = await findBundle(attempt);
      if (bundle) break;
    }
  } catch (e) {
    return Result.errMsg(
      `Could not load claims for identity: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!bundle?.signedEvent || !bundle.serializedContent?.contentBytes) {
    return Result.err({
      message: 'Could not find the referenced claim event.',
      extendedMessage: `No event with sequence ${eventKey.sequence} in collection ${COLLECTION.VERIFICATIONS} for identity '${eventKey.identity}' on the servers this bot syncs with.`,
    });
  }

  try {
    const event = v2.Event.fromBinary(bundle.signedEvent.eventBytes);
    if (!event.key) return Result.errMsg('Claim event has no key.');

    const content = v2.Content.fromBinary(
      bundle.serializedContent.contentBytes,
    );
    if (content.contentBody.oneofKind !== 'verificationClaim') {
      return Result.errMsg('Referenced event is not a verification claim.');
    }

    const verificationClaim = content.contentBody.verificationClaim;
    const schemaBytes = verificationClaim.schema?.schemaBytes;
    if (!schemaBytes) return Result.errMsg('Claim is missing its schema.');
    const schema = v2.VerificationSchema.fromBinary(schemaBytes);

    const decoder = new TextDecoder();
    const decode = (key: string) =>
      decoder.decode(verificationClaim.fields[key] ?? new Uint8Array());

    const fields: ClaimField[] = [];
    let platform: string | undefined;
    for (const field of schema.fields) {
      const ordinal = fieldOrdinal(field.key);
      if (ordinal !== undefined) {
        fields.push({ key: ordinal, value: decode(field.key) });
      } else if (field.key === 'platform') {
        platform = decode(field.key);
      }
      // Anything else (e.g. `url`) is display metadata — not proof-checked.
    }
    fields.sort((a, b) => a.key - b.key);

    return Result.ok({
      eventKey: event.key,
      schemaName: schema.name,
      fields,
      platform,
      expectedToken: event.key.identity,
    });
  } catch (e) {
    return Result.errMsg(
      `Failed to decode the claim: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Publish a VerificationVerify for `claimEventKey` as the bot's identity — this
 * signed event IS the verification. Returns the hex `EventKey` id of the verify
 * event.
 */
export async function publishVerify(
  client: PolycentricClient,
  claimEventKey: v2.EventKey,
): Promise<string> {
  const content = v2.Content.create({
    contentBody: {
      oneofKind: 'verificationVerify',
      verificationVerify: { claimEventKey },
    },
  });
  await client.contentManager.save(content);
  const event = await client.buildEvent(content, COLLECTION.VERIFICATIONS);
  const signedEvent = await client.signEvent(event);
  await client.commitEvent(signedEvent, content);
  const verifyEvent = v2.Event.fromBinary(signedEvent.eventBytes);
  if (!verifyEvent.key) throw new Error('Verify event has no key.');
  return Buffer.from(v2.EventKey.toBinary(verifyEvent.key)).toString('hex');
}

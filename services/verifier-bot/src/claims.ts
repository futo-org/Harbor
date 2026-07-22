import { COLLECTION, type PolycentricClient, v2 } from '@polycentric/js-core';
import type { ClaimField } from './models.js';
import { Result } from './result.js';

// ─────────────────────────────────────────────────────────────────────────
// PROVISIONAL verification-claim contract.
//
// The new app's social-platform ("loop-back") claim flow is not finished yet
// (see apps/polycentric .../ClaimCreatePlatformLink.tsx — "TODO: start the
// platform loop-back verification flow"), so the exact claim shape isn't
// pinned down. Everything we had to invent lives HERE so that, once the app
// defines it, reconciliation is a single-file change:
//   • SCHEMA_NAME  — all platform claims share ONE `VerificationSchema` (the
//                    app's "Platform" claim type); the schema name does NOT
//                    encode the platform. Which platform a claim is for is
//                    determined by the verifier/route it's sent to, not the
//                    schema. `requestVerify` only checks the claim uses this
//                    shared schema.
//   • field order  — the old bot addressed claim fields by numeric index
//                    (key 0 = handle, key 1 = channel id, …). New claims key
//                    fields by string, so we expose them as ordinal
//                    `ClaimField`s in the schema's declared field order, which
//                    keeps every platform's proof logic untouched.
//   • expectedToken — the loop-back token a user puts in their profile. The
//                    old system used base64(claimant public key); we use the
//                    claim author's signing key the same way until the app
//                    settles the token format.
// ─────────────────────────────────────────────────────────────────────────

// The single schema shared by every platform verification claim (provisional).
export const SCHEMA_NAME = 'Platform';

export interface DecodedClaim {
  // The claim event, referenced by a VerificationVerify when we verify it.
  eventKey: v2.EventKey;
  // `VerificationSchema.name` — which verifier should handle this claim.
  schemaName: string;
  // Fields in the schema's declared order, keyed by ordinal index.
  fields: ClaimField[];
  // Provisional loop-back token to look for in the claimant's profile.
  expectedToken: string;
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
  let bundles: v2.EventBundle[];
  try {
    bundles = await client.listEvents({
      identity: eventKey.identity,
      collection: COLLECTION.VERIFICATIONS,
    });
  } catch (e) {
    return Result.errMsg(
      `Could not load claims for identity: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const bundle = bundles.find((b) => {
    if (!b.signedEvent) return false;
    try {
      const event = v2.Event.fromBinary(b.signedEvent.eventBytes);
      return event.key?.sequence === eventKey.sequence;
    } catch {
      return false;
    }
  });

  if (!bundle?.signedEvent || !bundle.serializedContent?.contentBytes) {
    return Result.errMsg('Could not find the referenced claim event.');
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
    const fields: ClaimField[] = schema.fields.map((field, index) => ({
      key: index,
      value: decoder.decode(
        verificationClaim.fields[field.key] ?? new Uint8Array(),
      ),
    }));

    return Result.ok({
      eventKey: event.key,
      schemaName: schema.name,
      fields,
      expectedToken: Buffer.from(
        event.key.signedBy?.key ?? new Uint8Array(),
      ).toString('base64'),
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

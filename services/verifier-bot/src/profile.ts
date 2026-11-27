import { readFile } from 'node:fs/promises';
import {
  COLLECTION,
  type PolycentricClient,
  SyncStrategy,
  v2,
} from '@polycentric/js-sdk';

const AVATAR_URL = new URL('./avatar.png', import.meta.url);
const AVATAR_SIZE = 256;

/** The profile update of the bot's newest profile event, if any. */
async function currentProfile(
  client: PolycentricClient,
  identity: string,
): Promise<v2.ProfileUpdate | undefined> {
  const bundles = await client.listEvents({
    identity,
    collection: COLLECTION.PROFILE,
  });

  let latest: v2.ProfileUpdate | undefined;
  let latestSequence = -1n;

  for (const { signedEvent, serializedContent } of bundles) {
    if (!signedEvent || !serializedContent) continue;

    const sequence = v2.Event.fromBinary(signedEvent.eventBytes).key?.sequence;
    if (sequence === undefined || sequence <= latestSequence) continue;

    const body = v2.Content.fromBinary(
      serializedContent.contentBytes,
    ).contentBody;
    if (body.oneofKind !== 'profileUpdate') continue;

    latest = body.profileUpdate;
    latestSequence = sequence;
  }

  return latest;
}

/** Publish the bot's profile (name, avatar, description) when it has changed. */
export async function ensureProfile(client: PolycentricClient): Promise<void> {
  const identity = client.activeIdentityKey;
  if (!identity) return;

  try {
    const name =
      process.env.HARBOR_VERIFIER_BOT_PROFILE_NAME || 'Harbor Verifier Bot';
    const description =
      process.env.HARBOR_VERIFIER_BOT_PROFILE_DESCRIPTION ||
      'Automatically verifies that a Harbor identity owns the accounts it claims on other platforms.';
    const blob = await client.commitBlob(
      await readFile(AVATAR_URL),
      'image/png',
    );

    const current = await currentProfile(client, identity);
    const currentAvatar = current?.avatar?.images[0]?.blob?.digest?.value;
    const avatarMatches =
      !!currentAvatar &&
      !!blob.digest &&
      Buffer.from(currentAvatar).equals(blob.digest.value);

    if (
      current?.name === name &&
      current.description === description &&
      avatarMatches
    ) {
      return;
    }

    const content = v2.Content.create({
      contentBody: {
        oneofKind: 'profileUpdate',
        profileUpdate: {
          name,
          description,
          avatar: {
            images: [{ blob, width: AVATAR_SIZE, height: AVATAR_SIZE }],
          },
        },
      },
    });
    await client.createEvent({ collection: COLLECTION.PROFILE, content });
    await client.sync(SyncStrategy.PARTIAL_PUSH);
    console.log('Published bot profile');
  } catch (e) {
    // Non-fatal: verifying still works, the bot just shows the old profile.
    console.warn('Failed to publish bot profile:', e);
  }
}

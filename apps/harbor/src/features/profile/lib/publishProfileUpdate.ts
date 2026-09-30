import { processAndUploadImage } from '@/src/common/lib/images/processAndUploadImage';
import { hexToBytes } from '@/src/common/lib/polycentric-hooks/helpers';
import {
  COLLECTION,
  type PolycentricClient,
  v2,
} from '@polycentric/react-native';

type PublishProfileUpdateInput = {
  name: string;
  description: string;
  /** New avatar to upload; when absent, `avatar` is republished as-is. */
  avatarUri?: string | null;
  /** Existing image sets to carry forward — a ProfileUpdate is a full
   *  snapshot and readers only use the newest one. */
  avatar?: v2.ImageSet | null;
  banner?: v2.ImageSet | null;
  alias?: string | null;
  knownAs?: string | null;
};

// When the user picked a new avatar, resize + upload every
// variant and capture the returned ImageSet. Default sizes and
// `fill` mode give us the square variants avatars want.
export async function publishProfileUpdate(
  client: PolycentricClient,
  {
    name,
    description,
    avatarUri,
    avatar,
    banner,
    alias,
    knownAs,
  }: PublishProfileUpdateInput,
): Promise<void> {
  const nextAvatar = avatarUri
    ? await processAndUploadImage(client, avatarUri)
    : (avatar ?? undefined);
  const trimmedAlias = alias?.trim();
  const content = client.contentManager.build({
    oneofKind: 'profileUpdate',
    profileUpdate: {
      name,
      description,
      avatar: nextAvatar,
      banner: banner ?? undefined,
      alias: trimmedAlias ? trimmedAlias : undefined,
      knownAs: knownAs
        ? v2.EventKey.fromBinary(hexToBytes(knownAs))
        : undefined,
    },
  });

  await client.contentManager.save(content);
  const event = await client.buildEvent(content, COLLECTION.PROFILE);
  const signedEvent = await client.signEvent(event);
  await client.commitEvent(signedEvent, content);
  await client.sync();
}

import {
  encodeImageVariants,
  type ImageVariant,
} from '@/src/common/lib/images/processAndUploadImage';
import {
  COLLECTION,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native';

type UpdateProfileInput = {
  name: string;
  description: string;
  /** New avatar to upload; when absent, `avatar` is republished as-is. */
  avatarUri?: string | null;
  /** Existing image sets to carry forward — a ProfileUpdate is a full
   *  snapshot and readers only use the newest one. */
  avatar?: v2.ImageSet | null;
  banner?: v2.ImageSet | null;
  alias?: string | null;
};

export async function updateProfile(
  client: PolycentricClient,
  { name, description, avatarUri, avatar, banner, alias }: UpdateProfileInput,
): Promise<void> {
  let avatarMeta: v2.ImageSet | undefined;
  let newAvatarVariants: ImageVariant[] = [];

  if (avatarUri) {
    newAvatarVariants = await encodeImageVariants(avatarUri);
    avatarMeta = v2.ImageSet.create({
      images: newAvatarVariants.map(({ meta }) => meta),
    });
  } else {
    avatarMeta = avatar ?? undefined;
  }

  const trimmedAlias = alias?.trim();

  const content = client.contentManager.build({
    oneofKind: 'profileUpdate',
    profileUpdate: {
      name,
      description: description ? description : undefined,
      avatar: avatarMeta,
      banner: banner ?? undefined,
      alias: trimmedAlias ? trimmedAlias : undefined,
    },
  });

  const event = await client.buildEvent(content, COLLECTION.PROFILE);
  const signedEvent = await client.signEvent(event);

  await Promise.all(
    newAvatarVariants.map(({ digest, bytes }) =>
      client.fileStore.put(digest, bytes),
    ),
  );

  await client.contentManager.save(content);
  await client.commitEvent(signedEvent, content);
}

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
  // Build profile update event
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

  const content = v2.Content.create({
    contentBody: new v2.ContentBody.ProfileUpdate({
      profileUpdate: v2.ProfileUpdate.create({
        name,
        description: description ? description : undefined,
        avatar: avatarMeta,
        banner: banner ?? undefined,
        alias: trimmedAlias ? trimmedAlias : undefined,
      }),
    }),
  });

  // Store the new avatar's variants locally before the event that
  // references them.
  await Promise.all(
    newAvatarVariants.map(({ bytes, blob }) =>
      client.commitBlob(bytes, blob.mimeType),
    ),
  );

  await client.publish(content, COLLECTION.PROFILE);
}

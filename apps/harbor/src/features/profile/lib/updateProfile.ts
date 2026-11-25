import {
  encodeImageVariants,
  type ImageVariant,
} from '@/src/common/lib/images/processAndUploadImage';
import {
  COLLECTION,
  type CreateEventArgs,
  v2,
  type PolycentricClient,
} from '@polycentric/react-native-sdk';

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

/** Assemble the full profile update in-memory but don't persist it. */
export async function draftProfileUpdate(
  client: PolycentricClient,
  { name, description, avatarUri, avatar, banner, alias }: UpdateProfileInput,
): Promise<CreateEventArgs> {
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

  // Types are already compatible
  const blobs = newAvatarVariants;

  return { collection: COLLECTION.PROFILE, content, blobs };
}

/** Update the active identity's profile locally. */
export async function updateProfile(
  client: PolycentricClient,
  input: UpdateProfileInput,
): Promise<void> {
  const args = await draftProfileUpdate(client, input);
  await client.createEvent(args);
}

import { processAndUploadImage } from '@/src/common/lib/images/processAndUploadImage';
import { COLLECTION, type PolycentricClient } from '@polycentric/react-native';

type PublishProfileUpdateInput = {
  name: string;
  description: string;
  avatarUri?: string | null;
  webfingerAlias?: string | null;
};

// When the user picked a new avatar, resize + upload every
// variant and capture the returned ImageSet. Default sizes and
// `fill` mode give us the square variants avatars want.
export async function publishProfileUpdate(
  client: PolycentricClient,
  { name, description, avatarUri, webfingerAlias }: PublishProfileUpdateInput,
): Promise<void> {
  const avatar = avatarUri
    ? await processAndUploadImage(client, avatarUri)
    : undefined;
  const trimmedAlias = webfingerAlias?.trim();
  const content = client.contentManager.build({
    oneofKind: 'profileUpdate',
    profileUpdate: {
      name,
      description,
      avatar,
      webfingerAlias: trimmedAlias ? trimmedAlias : undefined,
    },
  });

  await client.contentManager.save(content);
  const event = await client.buildEvent(content, COLLECTION.PROFILE);
  const signedEvent = await client.signEvent(event);
  await client.commitEvent(signedEvent, content);
  await client.sync();
}

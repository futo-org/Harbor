import { COLLECTION, type PolycentricClient } from '@polycentric/react-native';
import { processAndUploadImage } from '@/src/common/lib/images/processAndUploadImage';

type PublishProfileUpdateInput = {
  name: string;
  description: string;
  avatarUri?: string | null;
};

export async function publishProfileUpdate(
  client: PolycentricClient,
  { name, description, avatarUri }: PublishProfileUpdateInput,
): Promise<void> {
  const avatar = avatarUri
    ? await processAndUploadImage(client, avatarUri)
    : undefined;

  const content = client.contentManager.build({
    oneofKind: 'profileUpdate',
    profileUpdate: {
      name,
      description,
      avatar,
    },
  });

  await client.contentManager.save(content);
  const event = await client.buildEvent(content, COLLECTION.PROFILE);
  const signedEvent = await client.signEvent(event);
  await client.commitEvent(signedEvent, content);
  await client.sync();
}

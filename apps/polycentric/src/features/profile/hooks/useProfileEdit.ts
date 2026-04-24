import { useState, useEffect, useCallback } from 'react';
import { sha256 } from '@noble/hashes/sha2';
import { usePolycentric } from '../../../common/lib/polycentric-hooks/PolycentricProvider';
import { COLLECTION, v2 } from '@polycentric/react-native';

interface ProfileRef {
  description: string | null;
  refresh: () => void;
}

export type ProfileEditState = {
  editing: boolean;
  setEditing: (value: boolean) => void;
  nameDraft: string;
  setNameDraft: (value: string) => void;
  descriptionDraft: string;
  setDescriptionDraft: (value: string) => void;
  avatarUri: string | null;
  setAvatarUri: (value: string | null) => void;
  saving: boolean;
  handleSave: () => Promise<void>;
  handleCancel: () => void;
};

export function useProfileEdit(
  username: string,
  profile: ProfileRef,
): ProfileEditState {
  const client = usePolycentric();

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const [avatarImageSet, setAvatarImageSet] = useState<v2.ImageSet | null>(
    null,
  );
  const [avatarBlobBodies, setAvatarBlobBodies] = useState<Uint8Array[]>([]);

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNameDraft(username);
  }, [username]);

  useEffect(() => {
    setDescriptionDraft(profile.description ?? '');
  }, [profile.description]);

  useEffect(() => {
    if (!avatarUri) {
      setAvatarImageSet(null);
      setAvatarBlobBodies([]);
      return;
    }
    (async () => {
      const response = await fetch(avatarUri);
      const raw = new Uint8Array(await response.arrayBuffer());
      const sizes = [48, 128, 512];
      const variants = await Promise.all(
        sizes.map(async (size) => {
          const jpeg = client.processImageToJpeg(raw, size, size);
          const image = v2.Image.create({
            blob: {
              digest: {
                type: v2.ContentDigestType.SHA256,
                value: sha256(jpeg),
              },
              mimeType: 'image/jpeg',
              size: BigInt(jpeg.length),
            },
            width: size,
            height: size,
          });
          return { image, body: jpeg };
        }),
      );

      setAvatarImageSet(
        v2.ImageSet.create({ images: variants.map((v) => v.image) }),
      );
      setAvatarBlobBodies(variants.map((v) => v.body));
    })();
  }, [avatarUri, client]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Upload every avatar variant's bytes first; the server verifies
      // the body against each declared digest before accepting.
      if (avatarImageSet && avatarBlobBodies.length > 0) {
        await Promise.all(
          avatarImageSet.images.map((image, i) => {
            const body = avatarBlobBodies[i];
            if (!image.blob || !body) return Promise.resolve();
            return client.uploadBlob(image.blob, body);
          }),
        );
      }

      const content = client.contentManager.build({
        oneofKind: 'profileUpdate',
        profileUpdate: {
          name: nameDraft,
          description: descriptionDraft,
          avatar: avatarImageSet ?? undefined,
        },
      });
      await client.contentManager.save(content);
      const event = await client.buildEvent(content, COLLECTION.PROFILE);
      const signedEvent = await client.signEvent(event);
      await client.commitEvent(signedEvent);
      await client.sync();
      profile.refresh();
      setEditing(false);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  }, [
    client,
    nameDraft,
    descriptionDraft,
    avatarImageSet,
    avatarBlobBodies,
    profile,
  ]);

  const handleCancel = useCallback(() => {
    setNameDraft(username);
    setDescriptionDraft(profile.description ?? '');
    setAvatarUri(null);
    setAvatarImageSet(null);
    setAvatarBlobBodies([]);
    setEditing(false);
  }, [username, profile.description]);

  return {
    editing,
    setEditing,
    nameDraft,
    setNameDraft,
    descriptionDraft,
    setDescriptionDraft,
    avatarUri,
    setAvatarUri,
    saving,
    handleSave,
    handleCancel,
  };
}

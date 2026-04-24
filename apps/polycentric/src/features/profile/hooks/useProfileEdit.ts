import { useCallback, useEffect, useState } from 'react';
import { COLLECTION } from '@polycentric/react-native';
import { usePolycentric } from '../../../common/lib/polycentric-hooks/PolycentricProvider';
import { processAndUploadImage } from '../../../common/lib/images/processAndUploadImage';

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNameDraft(username);
  }, [username]);

  useEffect(() => {
    setDescriptionDraft(profile.description ?? '');
  }, [profile.description]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // When the user picked a new avatar, resize + upload every
      // variant and capture the returned ImageSet. Default sizes and
      // `fill` mode give us the square variants avatars want.
      const avatar = avatarUri
        ? await processAndUploadImage(client, avatarUri)
        : undefined;

      const content = client.contentManager.build({
        oneofKind: 'profileUpdate',
        profileUpdate: {
          name: nameDraft,
          description: descriptionDraft,
          avatar,
        },
      });
      await client.contentManager.save(content);
      const event = await client.buildEvent(content, COLLECTION.PROFILE);
      const signedEvent = await client.signEvent(event);
      await client.commitEvent(signedEvent, content);
      await client.sync();
      profile.refresh();
      setEditing(false);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  }, [client, nameDraft, descriptionDraft, avatarUri, profile]);

  const handleCancel = useCallback(() => {
    setNameDraft(username);
    setDescriptionDraft(profile.description ?? '');
    setAvatarUri(null);
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

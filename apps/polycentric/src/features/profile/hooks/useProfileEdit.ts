import { useCallback, useEffect, useState } from 'react';
import { usePolycentric } from '../../../common/lib/polycentric-hooks/PolycentricProvider';
import { publishProfileUpdate } from '../lib/publishProfileUpdate';

interface ProfileRef {
  description: string | null;
  webfingerAlias: string | null;
  refresh: () => void;
}

export type ProfileEditState = {
  editing: boolean;
  setEditing: (value: boolean) => void;
  nameDraft: string;
  setNameDraft: (value: string) => void;
  descriptionDraft: string;
  setDescriptionDraft: (value: string) => void;
  webfingerAliasDraft: string;
  setWebfingerAliasDraft: (value: string) => void;
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
  const [webfingerAliasDraft, setWebfingerAliasDraft] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNameDraft(username);
  }, [username]);

  useEffect(() => {
    setDescriptionDraft(profile.description ?? '');
  }, [profile.description]);

  useEffect(() => {
    setWebfingerAliasDraft(profile.webfingerAlias ?? '');
  }, [profile.webfingerAlias]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await publishProfileUpdate(client, {
        name: nameDraft,
        description: descriptionDraft,
        avatarUri,
        webfingerAlias: webfingerAliasDraft,
      });
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
    webfingerAliasDraft,
    avatarUri,
    profile,
  ]);

  const handleCancel = useCallback(() => {
    setNameDraft(username);
    setDescriptionDraft(profile.description ?? '');
    setWebfingerAliasDraft(profile.webfingerAlias ?? '');
    setAvatarUri(null);
    setEditing(false);
  }, [username, profile.description, profile.webfingerAlias]);

  return {
    editing,
    setEditing,
    nameDraft,
    setNameDraft,
    descriptionDraft,
    setDescriptionDraft,
    webfingerAliasDraft,
    setWebfingerAliasDraft,
    avatarUri,
    setAvatarUri,
    saving,
    handleSave,
    handleCancel,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { resolveWebFinger } from '@polycentric/react-native';
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
  /** Set when a save was rejected because the alias failed verification. */
  aliasError: string | null;
  /** Resolves to true if the profile was committed, false if it was rejected. */
  handleSave: () => Promise<boolean>;
  handleCancel: () => void;
};

export function useProfileEdit(
  username: string,
  profile: ProfileRef,
  identityKey: string,
): ProfileEditState {
  const client = usePolycentric();

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [webfingerAliasDraft, setWebfingerAliasDraft] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(username);
  }, [username]);

  useEffect(() => {
    setDescriptionDraft(profile.description ?? '');
  }, [profile.description]);

  useEffect(() => {
    setWebfingerAliasDraft(profile.webfingerAlias ?? '');
  }, [profile.webfingerAlias]);

  // Editing the alias clears any stale verification error.
  useEffect(() => {
    setAliasError(null);
  }, [webfingerAliasDraft]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      // Verify a non-empty alias actually points back to this identity before
      // committing — otherwise the saved alias would never verify on view, and
      // we'd be publishing an unusable handle. An empty
      // alias just clears it, no verification needed.
      const alias = webfingerAliasDraft.trim();
      const original = (profile.webfingerAlias ?? '').trim();
      if (alias && alias !== original) {
        const resolved = await resolveWebFinger(alias);
        if (!resolved || resolved.toLowerCase() !== identityKey.toLowerCase()) {
          setAliasError("This alias doesn't point to your profile.");
          return false;
        }
      }

      await publishProfileUpdate(client, {
        name: nameDraft,
        description: descriptionDraft,
        avatarUri,
        webfingerAlias: webfingerAliasDraft,
      });
      profile.refresh();
      setEditing(false);
      return true;
    } catch (err) {
      console.error('Failed to save profile:', err);
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    client,
    identityKey,
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
    aliasError,
    handleSave,
    handleCancel,
  };
}

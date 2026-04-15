import { useState, useEffect, useCallback } from 'react';
import { usePolycentric } from './PolycentricProvider';

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
      // TODO: createUsername/createDescription require v2 content manager APIs
      console.warn('Profile editing not yet implemented in v2');
      profile.refresh();
      setEditing(false);
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  }, [client, nameDraft, descriptionDraft, profile]);

  const handleCancel = useCallback(() => {
    setNameDraft(username);
    setDescriptionDraft(profile.description ?? '');
    setEditing(false);
  }, [username, profile.description]);

  return {
    editing,
    setEditing,
    nameDraft,
    setNameDraft,
    descriptionDraft,
    setDescriptionDraft,
    saving,
    handleSave,
    handleCancel,
  };
}

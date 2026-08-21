import type { Href } from 'expo-router';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useState } from 'react';
import { create } from 'zustand';
import { RETURN_TO_PARAM, Routes, safeReturnTo } from '@/src/common/constants';
import { createIdentity } from '@polycentric/react-native';
import { getNextStep, isLastStep, type SignupRoute } from './flow';
import {
  DEFAULT_SERVER,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { publishProfileUpdate } from '@/src/features/profile/lib/publishProfileUpdate';
import { invalidateQuery } from '@/src/common/query/hooks/useQuery';
import { profileQueryKey } from '@/src/features/profile/hooks/useProfile';

type ModerationLevel = 1 | 2 | 3;

interface ModerationSettings {
  violence: ModerationLevel;
  sexuallySuggestive: ModerationLevel;
  hate: ModerationLevel;
}

interface SignupData {
  displayName: string;
  about: string;
  avatarUri: string | null;
  moderation: ModerationSettings;
}

interface SignupStore {
  data: SignupData;
  setDisplayName: (displayName: string) => void;
  setAbout: (about: string) => void;
  setAvatarUri: (uri: string | null) => void;
  setModeration: (moderation: ModerationSettings) => void;
  reset: () => void;
}

const defaultData: SignupData = {
  displayName: '',
  about: '',
  avatarUri: null,
  moderation: {
    violence: 2,
    sexuallySuggestive: 2,
    hate: 2,
  },
};

const useSignupStore = create<SignupStore>((set) => ({
  data: defaultData,
  setDisplayName: (displayName) =>
    set((s) => ({ data: { ...s.data, displayName } })),
  setAbout: (about) => set((s) => ({ data: { ...s.data, about } })),
  setAvatarUri: (avatarUri) => set((s) => ({ data: { ...s.data, avatarUri } })),
  setModeration: (moderation) =>
    set((s) => ({ data: { ...s.data, moderation } })),
  reset: () => set({ data: defaultData }),
}));

export function useSignup() {
  const pathname = usePathname();
  const [submitting, setSubmitting] = useState(false);
  // Where the signup prompt was opened from, carried across the steps.
  const returnTo = safeReturnTo(
    useLocalSearchParams()[RETURN_TO_PARAM] as string | undefined,
  );
  const { client, refreshCurrentIdentity } = usePolycentricContext();
  const { data, setDisplayName, setAbout, setAvatarUri, setModeration, reset } =
    useSignupStore();

  const currentStep = pathname as SignupRoute;
  const currentIsLastStep = isLastStep(currentStep);

  const goToNextStep = () => {
    const nextStep = getNextStep(currentStep);
    if (nextStep) {
      router.push(
        returnTo
          ? { pathname: nextStep, params: { [RETURN_TO_PARAM]: returnTo } }
          : nextStep,
      );
    }
  };

  const close = () => {
    reset();
    router.dismissAll();
    router.back();
  };

  const finish = async () => {
    if (!client) {
      console.error('Client not available');
      return;
    }

    setSubmitting(true);
    try {
      await createIdentity(client, DEFAULT_SERVER);
      await publishProfileUpdate(client, {
        name: data.displayName,
        description: data.about,
        avatarUri: data.avatarUri,
      });
      await refreshCurrentIdentity();
      invalidateQuery(client, profileQueryKey(client.activeIdentityKey));
      reset();
      // Back to the screen the signup prompt was opened from, if any.
      router.dismissTo((returnTo ?? Routes.tabs.explore.index) as Href);
    } catch (error) {
      console.error('Failed to create identity:', error);
      setSubmitting(false);
    }
  };

  return {
    data,
    setDisplayName,
    setAbout,
    setAvatarUri,
    setModeration,
    currentStep,
    isLastStep: currentIsLastStep,
    goToNextStep,
    close,
    finish,
    submitting,
  };
}

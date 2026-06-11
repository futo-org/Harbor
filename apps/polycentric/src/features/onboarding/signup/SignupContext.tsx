import type { Href } from 'expo-router';
import { router, usePathname } from 'expo-router';
import { create } from 'zustand';
import { Routes } from '@/src/common/constants';
import { getNextStep, isLastStep, SignupRoute } from './flow';
import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { commitProfileUpdate } from '@/src/features/profile/lib/commitProfileUpdate';

type ModerationLevel = 1 | 2 | 3;

interface ModerationSettings {
  violence: ModerationLevel;
  sexual: ModerationLevel;
  hate: ModerationLevel;
}

interface SignupData {
  displayName: string;
  about: string;
  avatarUri: string | null;
  moderation: ModerationSettings;
  shouldSecureRotationKey: boolean;
}

interface SignupStore {
  data: SignupData;
  setDisplayName: (displayName: string) => void;
  setAbout: (about: string) => void;
  setAvatarUri: (uri: string | null) => void;
  setModeration: (moderation: ModerationSettings) => void;
  setShouldSecureRotationKey: (shouldSecureRotationKey: boolean) => void;
  reset: () => void;
}

const defaultData: SignupData = {
  displayName: '',
  about: '',
  avatarUri: null,
  moderation: {
    violence: 2,
    sexual: 2,
    hate: 2,
  },
  shouldSecureRotationKey: true,
};

const useSignupStore = create<SignupStore>((set) => ({
  data: defaultData,
  setDisplayName: (displayName) =>
    set((s) => ({ data: { ...s.data, displayName } })),
  setAbout: (about) => set((s) => ({ data: { ...s.data, about } })),
  setAvatarUri: (avatarUri) => set((s) => ({ data: { ...s.data, avatarUri } })),
  setModeration: (moderation) =>
    set((s) => ({ data: { ...s.data, moderation } })),
  setShouldSecureRotationKey: (shouldSecureRotationKey) =>
    set((s) => ({ data: { ...s.data, shouldSecureRotationKey } })),
  reset: () => set({ data: defaultData }),
}));

export function useSignup() {
  const pathname = usePathname();
  const { client, refreshCurrentIdentity } = usePolycentricContext();
  const {
    data,
    setDisplayName,
    setAbout,
    setAvatarUri,
    setModeration,
    setShouldSecureRotationKey,
    reset,
  } = useSignupStore();

  const currentStep = pathname as SignupRoute;
  const currentIsLastStep = isLastStep(currentStep);

  const goToNextStep = () => {
    const nextStep = getNextStep(currentStep);
    if (nextStep) {
      router.push(nextStep);
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

    try {
      await client.identityManager.createIdentity({
        protect: data.shouldSecureRotationKey,
      });
      await commitProfileUpdate(client, {
        name: data.displayName,
        description: data.about,
        avatarUri: data.avatarUri,
      });
      // One sync after the identity and profile events are all committed.
      await client.sync();
      await refreshCurrentIdentity();
      reset();
      router.replace(Routes.tabs.feed.index as Href);
    } catch (error) {
      console.error('Failed to create identity:', error);
      throw error;
    }
  };

  return {
    data,
    setDisplayName,
    setAbout,
    setAvatarUri,
    setModeration,
    setShouldSecureRotationKey,
    currentStep,
    isLastStep: currentIsLastStep,
    goToNextStep,
    close,
    finish,
  };
}

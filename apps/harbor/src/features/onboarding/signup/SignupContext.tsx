import type { Href } from 'expo-router';
import { router, usePathname } from 'expo-router';
import { create } from 'zustand';
import { Routes } from '@/src/common/constants';
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
  const { client, refreshCurrentIdentity } = usePolycentricContext();
  const { data, setDisplayName, setAbout, setAvatarUri, setModeration, reset } =
    useSignupStore();

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
      await createIdentity(client, DEFAULT_SERVER);
      await publishProfileUpdate(client, {
        name: data.displayName,
        description: data.about,
        avatarUri: data.avatarUri,
      });
      await refreshCurrentIdentity();
      invalidateQuery(client, profileQueryKey(client.activeIdentityKey));
      reset();
      router.replace(Routes.tabs.feed.index as Href);
    } catch (error) {
      console.error('Failed to create identity:', error);
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
  };
}

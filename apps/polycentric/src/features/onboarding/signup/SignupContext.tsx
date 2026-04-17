import type { Href } from 'expo-router';
import { router, usePathname } from 'expo-router';
import { create } from 'zustand';
import { Routes } from '@/src/common/constants';
import { createIdentity } from '@polycentric/react-native';
import { getNextStep, isLastStep, SignupRoute } from './flow';
import {
  DEFAULT_SERVER,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';

type ModerationLevel = 1 | 2 | 3;

interface ModerationSettings {
  violence: ModerationLevel;
  sexual: ModerationLevel;
  hate: ModerationLevel;
}

interface SignupData {
  username: string;
  about: string;
  avatarUri: string | null;
  moderation: ModerationSettings;
}

interface SignupStore {
  data: SignupData;
  setUsername: (username: string) => void;
  setAbout: (about: string) => void;
  setAvatarUri: (uri: string | null) => void;
  setModeration: (moderation: ModerationSettings) => void;
  reset: () => void;
}

const defaultData: SignupData = {
  username: '',
  about: '',
  avatarUri: null,
  moderation: {
    violence: 2,
    sexual: 2,
    hate: 2,
  },
};

const useSignupStore = create<SignupStore>((set) => ({
  data: defaultData,
  setUsername: (username) => set((s) => ({ data: { ...s.data, username } })),
  setAbout: (about) => set((s) => ({ data: { ...s.data, about } })),
  setAvatarUri: (avatarUri) => set((s) => ({ data: { ...s.data, avatarUri } })),
  setModeration: (moderation) =>
    set((s) => ({ data: { ...s.data, moderation } })),
  reset: () => set({ data: defaultData }),
}));

export function useSignup() {
  const pathname = usePathname();
  const { client, refreshCurrentIdentity } = usePolycentricContext();
  const { data, setUsername, setAbout, setAvatarUri, setModeration, reset } =
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
      await refreshCurrentIdentity();
      reset();
      router.replace(Routes.tabs.feed.index as Href);
    } catch (error) {
      console.error('Failed to create identity:', error);
    }
  };

  return {
    data,
    setUsername,
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

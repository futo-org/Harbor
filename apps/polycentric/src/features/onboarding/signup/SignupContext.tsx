import { createContext, useContext, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { createIdentityWithDefaultServer } from '@polycentric/react-native';
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

interface SignupContextValue {
  data: SignupData;
  setUsername: (username: string) => void;
  setAbout: (about: string) => void;
  setAvatarUri: (uri: string | null) => void;
  setModeration: (moderation: ModerationSettings) => void;
  currentStep: SignupRoute;
  isLastStep: boolean;
  goToNextStep: () => void;
  close: () => void;
  finish: () => Promise<void>;
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

const SignupContext = createContext<SignupContextValue | null>(null);

export function SignupProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { client } = usePolycentricContext();
  const [data, setData] = useState<SignupData>(defaultData);

  const currentStep = pathname as SignupRoute;
  const currentIsLastStep = isLastStep(currentStep);

  const setUsername = (username: string) => {
    setData((prev) => ({ ...prev, username }));
  };

  const setAbout = (about: string) => {
    setData((prev) => ({ ...prev, about }));
  };

  const setAvatarUri = (avatarUri: string | null) => {
    setData((prev) => ({ ...prev, avatarUri }));
  };

  const setModeration = (moderation: ModerationSettings) => {
    setData((prev) => ({ ...prev, moderation }));
  };

  const goToNextStep = () => {
    const nextStep = getNextStep(currentStep);
    if (nextStep) {
      router.push(nextStep);
    }
  };

  const close = () => {
    router.dismissAll();
    router.back();
  };

  const finish = async () => {
    if (!client) {
      console.error('Client not available');
      return;
    }

    try {
      // Create the identity
      await createIdentityWithDefaultServer(client, DEFAULT_SERVER);

      // Set profile data
      // if (data.username) {
      //   await client.createUsername(data.username);
      // }
      // if (data.about) {
      //   await client.createDescription(data.about);
      // }
      // if (data.avatarUri) {
      //   await client.createAvatar(data.avatarUri);
      // }

      // Navigate to the main app
      router.replace('/(tabs)/feed');
    } catch (error) {
      console.error('Failed to create identity:', error);
    }
  };

  return (
    <SignupContext.Provider
      value={{
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
      }}
    >
      {children}
    </SignupContext.Provider>
  );
}

export function useSignup() {
  const context = useContext(SignupContext);
  if (!context) {
    throw new Error('useSignup must be used within a SignupProvider');
  }
  return context;
}

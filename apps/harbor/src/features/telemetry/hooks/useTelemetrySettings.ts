import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface TelemetrySettingsStore {
  errorReportsEnabled: boolean;
  includeIdentity: boolean;
  setErrorReportsEnabled: (enabled: boolean) => void;
  setIncludeIdentity: (enabled: boolean) => void;
}

export const useTelemetrySettings = create<TelemetrySettingsStore>()(
  persist(
    (set) => ({
      errorReportsEnabled: false,
      includeIdentity: false,
      setErrorReportsEnabled: (enabled) =>
        set({ errorReportsEnabled: enabled }),
      setIncludeIdentity: (enabled) => set({ includeIdentity: enabled }),
    }),
    {
      name: 'polycentric:telemetry',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

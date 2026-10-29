import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface TelemetrySettingsStore {
  errorReportsEnabled: boolean;
  setErrorReportsEnabled: (enabled: boolean) => void;
}

export const useTelemetrySettings = create<TelemetrySettingsStore>()(
  persist(
    (set) => ({
      errorReportsEnabled: false,
      setErrorReportsEnabled: (enabled) =>
        set({ errorReportsEnabled: enabled }),
    }),
    {
      name: 'polycentric:telemetry',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

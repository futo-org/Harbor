import { ReactNode, createContext, useContext, useState } from 'react';
import { ColorSchemeName, useColorScheme } from 'react-native';
import { LegacyTheme, legacyDarkTheme, legacyLightTheme } from './legacyTheme';

export const LEGACY_THEME_MODES = ['light', 'dark', 'system'] as const;
export type LegacyThemeMode = (typeof LEGACY_THEME_MODES)[number];

export interface LegacyThemeContextType {
  legacyTheme: LegacyTheme;
  legacyThemeMode: LegacyThemeMode;
  legacyIsDark: boolean;
  legacySystemColorScheme: ColorSchemeName;
  setLegacyThemeMode: (mode: LegacyThemeMode) => void;
}

export const LegacyThemeContext = createContext<
  LegacyThemeContextType | undefined
>(undefined);

function getLegacyEffectiveMode(
  legacyThemeMode: LegacyThemeMode,
  legacySystemColorScheme: ColorSchemeName,
) {
  if (legacyThemeMode === 'system') {
    return legacySystemColorScheme === 'dark' ? 'dark' : 'light';
  }
  return legacyThemeMode;
}

export function LegacyThemeProvider({ children }: { children: ReactNode }) {
  const legacySystemColorScheme: ColorSchemeName = useColorScheme();
  const [legacyThemeMode, setLegacyThemeMode] =
    useState<LegacyThemeMode>('system');

  const effectiveMode = getLegacyEffectiveMode(
    legacyThemeMode,
    legacySystemColorScheme,
  );
  const legacyTheme =
    effectiveMode === 'dark' ? legacyDarkTheme : legacyLightTheme;

  return (
    <LegacyThemeContext.Provider
      value={{
        legacyTheme,
        legacyThemeMode,
        legacyIsDark: effectiveMode === 'dark',
        legacySystemColorScheme,
        setLegacyThemeMode,
      }}
    >
      {children}
    </LegacyThemeContext.Provider>
  );
}

export function useLegacyTheme() {
  const context = useContext(LegacyThemeContext);
  if (!context) {
    throw new Error('useLegacyTheme must be used within LegacyThemeProvider');
  }
  return context;
}

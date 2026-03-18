import { createContext, useContext, useState, ReactNode } from 'react';
import { useColorScheme, ColorSchemeName } from 'react-native';
import { Theme, lightTheme, darkTheme } from './theme';

const THEME_MODES = ['light', 'dark', 'system'] as const;
type ThemeMode = (typeof THEME_MODES)[number];

interface ThemeContextType {
  theme: Theme;
  themeMode: ThemeMode;
  isDark: boolean;
  systemColorScheme: ColorSchemeName;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getEffectiveMode(
  themeMode: ThemeMode,
  systemColorScheme: ColorSchemeName,
) {
  if (themeMode === 'system') {
    return systemColorScheme === 'dark' ? 'dark' : 'light';
  }
  return themeMode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme: ColorSchemeName = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');

  const effectiveMode = getEffectiveMode(themeMode, systemColorScheme);
  const theme = effectiveMode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider
      value={{
        theme,
        themeMode,
        isDark: effectiveMode === 'dark',
        systemColorScheme,
        setThemeMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

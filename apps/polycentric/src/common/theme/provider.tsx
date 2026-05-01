import { Fonts } from '@/src/common/assets';
import * as ReactNavigation from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';
import { themes, type Theme, type ThemeKey } from './themes';

export type ThemeContextValue = {
  theme: Theme;
  activeThemeName: ThemeKey;
  setActiveThemeName: (name: ThemeKey) => void;
};

export const Context = createContext<ThemeContextValue | undefined>(undefined);
Context.displayName = 'PolycentricThemeContext';

export function ThemeProvider({ children }: PropsWithChildren) {
  const [fontsLoaded, fontError] = useFonts({
    Inter: Fonts.Inter,
    'Inter-Italic': Fonts['Inter-Italic'],
  });

  const colorScheme = useColorScheme();
  const [activeThemeName, setActiveThemeName] = useState<ThemeKey>(() =>
    colorScheme === 'dark' ? 'dark' : 'light',
  );

  const theme = useMemo(() => themes[activeThemeName], [activeThemeName]);

  const value = useMemo(
    () => ({ theme, activeThemeName, setActiveThemeName }),
    [theme, activeThemeName],
  );

  if (fontError) {
    throw fontError;
  }

  if (!fontsLoaded) {
    return null;
  }

  const navTheme: ReactNavigation.Theme = {
    dark: theme.scheme === 'dark',
    colors: {
      primary: theme.palette.primary_500,
      background: theme.palette.neutral_0,
      card: theme.palette.neutral_25,
      text: theme.palette.neutral_1000,
      border: theme.palette.neutral_200,
      notification: theme.palette.negative_500,
    },
    fonts: ReactNavigation.DefaultTheme.fonts,
  };

  return (
    <Context.Provider value={value}>
      <ReactNavigation.ThemeProvider value={navTheme}>
        {children}
      </ReactNavigation.ThemeProvider>
    </Context.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

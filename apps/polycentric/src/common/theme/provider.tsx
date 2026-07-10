import { Fonts } from '@/src/common/assets';
import { useFonts } from 'expo-font';
import {
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';
import { loadThemeName, saveThemeName } from './storage';
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

  // useColorScheme returns the system theme preference.
  const colorScheme = useColorScheme();
  const [activeThemeName, setActiveThemeNameState] = useState<ThemeKey>(
    colorScheme === 'dark' ? 'dark' : 'light',
  );
  const [themePreferenceLoaded, setThemePreferenceLoaded] = useState(false);

  useEffect(() => {
    void loadThemeName().then((themeName) => {
      if (themeName) {
        setActiveThemeNameState(themeName);
      }
      setThemePreferenceLoaded(true);
    });
  }, []);

  const setActiveThemeName = useCallback((name: ThemeKey) => {
    setActiveThemeNameState(name);
    void saveThemeName(name);
  }, []);

  const theme = useMemo(() => themes[activeThemeName], [activeThemeName]);

  const value = useMemo(
    () => ({ theme, activeThemeName, setActiveThemeName }),
    [theme, activeThemeName, setActiveThemeName],
  );

  if (fontError) {
    throw fontError;
  }

  if (!fontsLoaded || !themePreferenceLoaded) {
    return null;
  }

  const navTheme: typeof DefaultTheme = {
    dark: theme.scheme === 'dark',
    colors: {
      primary: theme.palette.primary_500,
      background: theme.palette.neutral_0,
      card: theme.palette.neutral_25,
      text: theme.palette.neutral_1000,
      border: theme.palette.neutral_200,
      notification: theme.palette.negative_500,
    },
    fonts: DefaultTheme.fonts,
  };

  return (
    <Context.Provider value={value}>
      <NavigationThemeProvider value={navTheme}>
        {children}
      </NavigationThemeProvider>
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

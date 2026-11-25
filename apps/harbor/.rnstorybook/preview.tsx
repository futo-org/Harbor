import { IconButton } from '@/src/common/components';
import {
  Atoms,
  Context,
  Spacing,
  themes,
  type ThemeScheme,
  useTheme,
} from '@/src/common/theme';
import type { Preview } from '@storybook/react-native';
import { type PropsWithChildren, useMemo } from 'react';
import { View } from 'react-native';
import { create } from 'zustand';

// Outside the decorator so it survives switching stories. `null` follows the
// app's theme.
const useStorySchemeStore = create<{ scheme: ThemeScheme | null }>(() => ({
  scheme: null,
}));

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeDecorator>
        <Story />
      </ThemeDecorator>
    ),
  ],
};

export default preview;

function ThemeDecorator({ children }: PropsWithChildren) {
  const appThemeContext = useTheme();
  const storyScheme = useStorySchemeStore((state) => state.scheme);
  const scheme = storyScheme ?? appThemeContext.theme.scheme;
  const theme = themes[scheme];

  // Overrides only the theme: the app's persisted preference stays untouched
  const themeContext = useMemo(
    () => ({ ...appThemeContext, theme }),
    [appThemeContext, theme],
  );

  return (
    <Context.Provider value={themeContext}>
      <View style={[Atoms.flex_1, theme.atoms.box.primary.bg]}>
        {children}
        <IconButton
          size="sm"
          icon={scheme === 'dark' ? 'themeLight' : 'themeDark'}
          accessibilityLabel={
            scheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
          }
          onPress={() =>
            useStorySchemeStore.setState({
              scheme: scheme === 'dark' ? 'light' : 'dark',
            })
          }
          style={[Atoms.absolute, { top: Spacing.xs, right: Spacing.xs }]}
        />
      </View>
    </Context.Provider>
  );
}

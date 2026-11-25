import { IconButton } from '@/src/common/components';
import {
  Atoms,
  Context,
  Spacing,
  themes,
  type ThemeScheme,
} from '@/src/common/theme';
import type { Preview } from '@storybook/react-native';
import { type PropsWithChildren, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { create } from 'zustand';

// Stories' own scheme, apart from the app's theme. Outside the decorator so it
// survives switching stories.
const useStorySchemeStore = create<{ scheme: ThemeScheme }>(() => ({
  scheme: 'light',
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
  const scheme = useStorySchemeStore((state) => state.scheme);
  const theme = themes[scheme];

  // Theme switchers in stories (e.g. AppFooter's) switch the stories' scheme;
  // 'system' does nothing
  const themeContext = useMemo(
    () => ({
      theme,
      themePreference: scheme,
      setThemePreference: (preference: ThemeScheme | 'system') => {
        if (preference !== 'system') {
          useStorySchemeStore.setState({ scheme: preference });
        }
      },
    }),
    [theme, scheme],
  );

  return (
    <Context.Provider value={themeContext}>
      <View style={[Atoms.flex_1, theme.atoms.box.primary.bg]}>
        <ScrollView contentContainerStyle={Atoms.flex_grow_1}>
          {children}
        </ScrollView>
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

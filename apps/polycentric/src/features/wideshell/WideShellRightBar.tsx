import { Text, TextInput } from '@/src/common/components';
import { FUTO_URL } from '@/src/common/constants';
import { toast } from '@/src/common/lib/toast';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { typography } from '@/src/common/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useCallback } from 'react';
import { Linking, Pressable, View } from 'react-native';

export const RIGHT_BAR_MIN_WIDTH = 200;
const RIGHT_BAR_MAX_WIDTH = 340;

const PANEL_MIN_HEIGHT = 96;
const THEME_ICON_SIZE = typography.fontSize.sm;

function pathOnly(pathname: string): string {
  const noQuery = pathname.split('?')[0] ?? pathname;
  const n = noQuery.replace(/\/$/, '') || '/';
  return n;
}

function isProfilePath(pathname: string): boolean {
  return pathOnly(pathname).startsWith('/profile/');
}

export function WideShellRightBar() {
  const pathname = usePathname();
  const { theme, setActiveThemeName } = useTheme();

  const isProfile = isProfilePath(pathname);
  const panelTitle = isProfile ? 'Recommended' : 'Topics';
  const panelTitleColor =
    theme.scheme === 'dark'
      ? theme.palette.neutral_800
      : theme.palette.neutral_700;

  const toggleTheme = useCallback(() => {
    const next = theme.name === 'dark' ? 'light' : 'dark';
    setActiveThemeName(next);
  }, [setActiveThemeName, theme.name]);

  const onSearchSubmit = useCallback(() => {
    toast.error('Search is coming soon');
  }, []);

  return (
    <View
      style={[
        {
          minWidth: RIGHT_BAR_MIN_WIDTH,
          maxWidth: RIGHT_BAR_MAX_WIDTH,
          width: '100%',
        },
        Atoms.flex_shrink_0,
        Atoms.mt_lg,
        Atoms.gap_md,
      ]}
    >
      <TextInput
        placeholder="Search"
        returnKeyType="search"
        onSubmitEditing={onSearchSubmit}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View
        style={[
          Atoms.rounded_lg,
          Atoms.p_md,
          {
            minHeight: PANEL_MIN_HEIGHT,
            borderWidth: 1,
            borderColor: withHexOpacity(theme.palette.neutral_500, '28'),
            backgroundColor: 'transparent',
          },
        ]}
      >
        <View style={Atoms.gap_sm}>
          <Text
            variant="title"
            style={[theme.atoms.text, { color: panelTitleColor }]}
          >
            {panelTitle}
          </Text>
          <Text variant="secondary" style={theme.atoms.text_neutral_low}>
            ...
          </Text>
        </View>
      </View>
      <View
        style={[
          Atoms.flex_row,
          Atoms.items_center,
          Atoms.justify_between,
          Atoms.w_full,
          Atoms.px_sm,
        ]}
      >
        <Pressable
          accessibilityLabel="Toggle color theme"
          accessibilityRole="button"
          hitSlop={8}
          onPress={toggleTheme}
          style={({ pressed }) => [pressed && { opacity: 0.65 }]}
        >
          <Ionicons
            name={theme.name === 'dark' ? 'moon' : 'sunny'}
            size={THEME_ICON_SIZE}
            color={theme.palette.neutral_500}
          />
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="FUTO"
          hitSlop={8}
          onPress={() => {
            void Linking.openURL(FUTO_URL);
          }}
        >
          <Text variant="small" style={theme.atoms.text_neutral_low}>
            FUTO
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

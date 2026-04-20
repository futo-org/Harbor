import { Avatar, IdentityTag, Text } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import {
  identiconUrl,
  useCurrentIdentity,
  useUsername,
} from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  BorderRadius,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

export function IdentityHeader() {
  const { identity: currentIdentity } = useCurrentIdentity();
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const username = useUsername(currentIdentity?.identityKey);

  // This component shouldn't mount if a current identity is not set.
  if (!currentIdentity?.identityKey) {
    console.warn('CurrIdentityHeader: missing current identity (unexpected)');
    return null;
  }

  const avatarUrl = identiconUrl(currentIdentity.identityKey);

  const identityRowHoverOverlay =
    theme.scheme === 'light'
      ? withHexOpacity(theme.palette.neutral_500, '14')
      : withHexOpacity(theme.palette.black, '28');

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.justify_between,
        Atoms.items_center,
        Atoms.gap_md,
      ]}
    >
      <Pressable
        onPress={() => router.push(Routes.tabs.feed.identity)}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        hitSlop={10}
        style={[
          Atoms.px_sm,
          Atoms.py_sm,
          {
            flexShrink: 1,
            borderRadius: BorderRadius.sm,
            overflow: 'hidden',
            position: 'relative',
          },
        ]}
      >
        <View
          style={[
            Atoms.flex_row,
            Atoms.gap_sm,
            { flex: 1, alignItems: 'baseline' },
          ]}
        >
          <Text
            variant="title"
            fontWeight="bold"
            color="neutral_1000"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {username}
          </Text>
          <IdentityTag identity={currentIdentity.identityKey} />
          <Ionicons
            name="chevron-down"
            size={22}
            color={theme.palette.neutral_1000}
          />
        </View>
        {hovered ? (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: BorderRadius.sm,
                backgroundColor: identityRowHoverOverlay,
              },
            ]}
          />
        ) : null}
      </Pressable>
      <Pressable
        onPress={() => {
          if (!currentIdentity.identityKey) return;
          router.push(Routes.tabs.profile(currentIdentity.identityKey));
        }}
      >
        <Avatar source={avatarUrl ? { uri: avatarUrl } : undefined} />
      </Pressable>
    </View>
  );
}

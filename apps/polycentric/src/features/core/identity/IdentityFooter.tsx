import {
  IdentityTag,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import {
  Atoms,
  BorderRadius,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

type IdentityFooterProps = {
  /** Render only the avatar — used in the narrow sidebar. */
  compact?: boolean;
};

export function IdentityFooter({ compact = false }: IdentityFooterProps) {
  const { identity: currentIdentity } = useCurrentIdentity();
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const profile = useProfile(currentIdentity?.identityKey);
  const username = profile.name ?? '';

  // This component shouldn't mount if a current identity is not set.
  if (!currentIdentity?.identityKey) {
    console.warn('CurrIdentityHeader: missing current identity (unexpected)');
    return null;
  }

  const identityRowHoverOverlay =
    theme.scheme === 'light'
      ? withHexOpacity(theme.palette.neutral_500, '14')
      : withHexOpacity(theme.palette.black, '28');

  const avatar = (
    <Pressable
      onPress={() => {
        if (!currentIdentity.identityKey) return;
        router.push(Routes.tabs.profile(currentIdentity.identityKey));
      }}
    >
      <ProfileAvatar identityKey={currentIdentity.identityKey} />
    </Pressable>
  );

  if (compact) {
    return avatar;
  }

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.justify_between,
        Atoms.items_center,
        Atoms.gap_sm,
      ]}
    >
      {avatar}
      <Pressable
        // TODO  Route to identitySwitch when that is implemented
        onPress={() => router.push(Routes.tabs.settings.identity)}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        hitSlop={10}
        style={[
          Atoms.flex_1,
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.px_sm,
          Atoms.py_sm,
        ]}
      >
        <View style={[Atoms.flex_col, Atoms.flex_1]}>
          <Text
            fontSize="md"
            fontWeight="bold"
            color="neutral_1000"
            numberOfLines={1}
          >
            {username}
          </Text>
          <IdentityTag identity={currentIdentity.identityKey} />
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
        <Ionicons
          name="chevron-down"
          size={18}
          color={theme.palette.neutral_1000}
        />
      </Pressable>
    </View>
  );
}

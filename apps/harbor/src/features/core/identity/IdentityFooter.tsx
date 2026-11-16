import { IdentityHandle } from '@/src/features/profile/IdentityHandle';
import { ProfileAvatar } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import { Username } from '@/src/features/profile/Username';
import Icon from '@/src/common/components/Icon';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

type IdentityFooterProps = {
  /** Render only the avatar — used in the narrow sidebar. */
  compact?: boolean;
};

export function IdentityFooter({ compact = false }: IdentityFooterProps) {
  const { identity: currentIdentity } = useCurrentIdentity();
  const { theme } = useTheme();

  // This component shouldn't mount if a current identity is not set.
  if (!currentIdentity?.identityKey) {
    console.warn('CurrIdentityHeader: missing current identity (unexpected)');
    return null;
  }

  const avatar = (
    <Pressable
      onPress={() => {
        if (!currentIdentity.identityKey) return;
        router.navigate(Routes.tabs.profile(currentIdentity.identityKey));
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
        onPress={() => router.navigate(Routes.tabs.settings.identity)}
        hitSlop={10}
        style={({ hovered }) => [
          Atoms.flex_1,
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.px_sm,
          Atoms.py_sm,
          { borderRadius: BorderRadius.sm },
          hovered && theme.atoms.box.primary.bg_hover,
        ]}
      >
        <View style={[Atoms.flex_col, Atoms.flex_1]}>
          <Username
            identity={currentIdentity.identityKey}
            fallbackName=""
            fontSize="md"
            fontWeight="bold"
            color="primary"
          />
          <IdentityHandle identity={currentIdentity.identityKey} />
        </View>
        <Icon name="chevronDown" size={18} color="primary" />
      </Pressable>
    </View>
  );
}

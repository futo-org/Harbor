import { IdentityHandle } from '@/src/features/profile/IdentityHandle';
import { ProfileAvatar } from '@/src/common/components/primitives';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import { Username } from '@/src/features/profile/Username';
import Icon from '@/src/common/components/Icon';
import { Pressable, View } from 'react-native';
import { useIdentitySwitcher } from './useIdentitySwitcher';

type IdentityFooterProps = {
  /** Render only the avatar — used in the narrow sidebar. */
  compact?: boolean;
};

export function IdentityFooter({ compact = false }: IdentityFooterProps) {
  const { identity: currentIdentity } = useCurrentIdentity();
  const { theme } = useTheme();
  const { open: openIdentitySwitcher } = useIdentitySwitcher();

  // This component shouldn't mount if a current identity is not set.
  if (!currentIdentity?.identityKey) {
    console.warn('CurrIdentityHeader: missing current identity (unexpected)');
    return null;
  }

  const avatar = <ProfileAvatar identityKey={currentIdentity.identityKey} />;

  const identityDisplay = compact ? (
    avatar
  ) : (
    <View
      style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm, Atoms.px_sm]}
    >
      {avatar}
      <View
        style={[Atoms.flex_1, Atoms.flex_row, Atoms.items_center, Atoms.py_sm]}
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
      </View>
    </View>
  );

  return (
    <Pressable
      onPress={openIdentitySwitcher}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Switch identity"
      style={({ hovered }) => [
        Atoms.p_xs,
        { borderRadius: BorderRadius.sm },
        hovered && theme.atoms.box.primary.bg_hover,
      ]}
    >
      {identityDisplay}
    </Pressable>
  );
}

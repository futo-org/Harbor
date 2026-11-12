import { ProfileAvatar } from '@/src/common/components/Avatar/ProfileAvatar';
import {
  AVATAR_SIZE,
  Block,
  SkeletonList,
  useShimmerOpacity,
} from '@/src/common/components/skeletons';
import { Atoms, useTheme } from '@/src/common/theme';
import { useProfile, type ProfileHookResult } from './hooks/useProfile';
import { IdentityHandle } from './IdentityHandle';
import { Username } from './Username';
import type { FetchMode } from '@polycentric/react-native';
import type { ReactNode } from 'react';
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

/**
 * A pressable identity row: avatar, name, and alias/shortened-id subtitle,
 * with an optional trailing element. Runs edge to edge (the hover
 * background spans the full width) with the standard horizontal inset.
 */
export function ProfileRow({
  identity,
  onPress,
  trailing,
  size = 'md',
  fetchMode,
  fallbackName,
  disabled,
  activeStyle = 'highlight',
  style,
}: {
  identity: string;
  onPress?: (identity: string, profile: ProfileHookResult) => void;
  trailing?: ReactNode;
  size?: 'sm' | 'md';
  fetchMode?: FetchMode;
  /** Shown when the profile has no cached name yet. */
  fallbackName?: string | null;
  disabled?: boolean;
  activeStyle?: 'highlight' | 'none';
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const profile = useProfile(identity, { fetchMode });

  return (
    <Pressable
      onPress={() => onPress?.(identity, profile)}
      disabled={disabled}
      // iOS folds an accessible view's children into one element, which
      // would hide any control in `trailing` from assistive tech.
      accessible={!trailing}
      style={({ hovered, pressed }) => [
        (hovered || pressed) &&
          activeStyle === 'highlight' && {
            backgroundColor: theme.palette.neutral_25,
          },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View
        style={[
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.gap_md,
          Atoms.px_lg,
          size === 'sm' ? Atoms.py_sm : Atoms.py_md,
          style,
        ]}
      >
        <ProfileAvatar identityKey={identity} size={size} />
        <View style={Atoms.flex_1}>
          <Username
            identity={identity}
            fallbackName={fallbackName}
            variant="secondary"
            fontWeight="semibold"
            selectable={false}
          />
          <IdentityHandle
            identity={identity}
            variant="small"
            selectable={false}
          />
        </View>
        {trailing}
      </View>
    </Pressable>
  );
}

/**
 * Placeholder shaped like a `ProfileRow` without a trailing element.
 */
export function ProfileRowSkeleton() {
  const animatedStyle = useShimmerOpacity();

  return (
    <Animated.View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_md,
        Atoms.px_lg,
        Atoms.py_md,
        animatedStyle,
      ]}
    >
      <Block width={AVATAR_SIZE} height={AVATAR_SIZE} />
      <View style={[Atoms.flex_1, Atoms.gap_sm]}>
        <Block width={120} />
        <Block width={80} height={10} />
      </View>
    </Animated.View>
  );
}

export function ProfileRowSkeletonList({ count }: { count: number }) {
  return (
    <SkeletonList count={count}>
      <ProfileRowSkeleton />
    </SkeletonList>
  );
}

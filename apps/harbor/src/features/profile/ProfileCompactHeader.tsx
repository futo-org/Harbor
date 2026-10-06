import { BackButton } from '@/src/common/components/composites';
import { TABS_HEIGHT } from '@/src/common/components/tabs';
import { TOPBAR_HEIGHT } from '@/src/common/components/layout/Topbar';
import { Button, ProfileAvatar } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme, ZIndex } from '@/src/common/theme';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import FollowButton from '../follow/FollowButton';
import { useProfileContext } from './ProfileContext';
import { Username } from './Username';
import { ProfileTabs } from './ProfileTabs';

const COMPACT_HEADER_HEIGHT = TOPBAR_HEIGHT + TABS_HEIGHT;

const REVEAL_MS = 220;
// Hysteresis, so resting on the threshold can't flicker.
const HIDE_MARGIN = 32;

/** Back button, follow state and tabs, kept on screen once the full profile
 *  header has scrolled away. */
export function ProfileCompactHeader({
  scrollY,
  headerHeight,
  onBack,
}: {
  scrollY: SharedValue<number>;
  /** Measured height of the full header this takes over from. */
  headerHeight: number;
  onBack: () => void;
}) {
  const { theme } = useTheme();
  const { identityKey, isSelf } = useProfileContext();

  const handleEdit = useCallback(() => {
    if (identityKey) router.push(Routes.tabs.editProfile(identityKey));
  }, [identityKey]);

  // Hands over as the full header's own tabs leave the screen.
  const revealAt = Math.max(0, headerHeight - COMPACT_HEADER_HEIGHT);
  const measured = headerHeight > 0;

  // Timed rather than scroll-linked, so it reads the same at any scroll speed.
  const visible = useSharedValue(false);
  const progress = useSharedValue(0);
  useAnimatedReaction(
    () => scrollY.value,
    (y) => {
      if (!measured) return;
      const next = y > revealAt - (visible.value ? HIDE_MARGIN : 0);
      if (next === visible.value) return;
      visible.value = next;
      progress.value = withTiming(next ? 1 : 0, { duration: REVEAL_MS });
    },
  );

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: -COMPACT_HEADER_HEIGHT * (1 - progress.value) }],
  }));

  return (
    <Animated.View
      style={[
        Atoms.absolute,
        {
          top: 0,
          left: 0,
          right: 0,
          zIndex: ZIndex.raised,
          backgroundColor: theme.palette.neutral_0,
        },
        style,
      ]}
    >
      <View
        style={[
          Atoms.flex_row,
          Atoms.items_center,
          Atoms.gap_md,
          Atoms.px_md,
          { height: TOPBAR_HEIGHT },
        ]}
      >
        <BackButton onPress={onBack} />
        {identityKey ? (
          <ProfileAvatar identityKey={identityKey} size="sm" />
        ) : null}
        <Username
          identity={identityKey}
          variant="body"
          fontWeight="bold"
          style={[Atoms.flex_1, { minWidth: 0 }]}
        />
        {isSelf ? (
          <Button
            title="Edit profile"
            onPress={handleEdit}
            variant="tertiary"
            size="sm"
          />
        ) : identityKey ? (
          <FollowButton identity={identityKey} />
        ) : null}
      </View>

      <ProfileTabs />
    </Animated.View>
  );
}

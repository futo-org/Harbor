import { BackButton } from '@/src/common/components/composites';
import { TABS_HEIGHT } from '@/src/common/components/tabs';
import { TOPBAR_HEIGHT } from '@/src/common/components/layout/Topbar';
import { Button, ProfileAvatar } from '@/src/common/components/primitives';
import { Routes } from '@/src/common/constants';
import { Atoms, useTheme, ZIndex } from '@/src/common/theme';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
// Scroll over which the status bar cover fades in once the banner starts leaving.
const STATUS_BAR_COVER_FADE_DISTANCE = 24;

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
  const insets = useSafeAreaInsets();
  const { identityKey, isSelf } = useProfileContext();
  // Covers the status bar too, as the screen draws under it.
  const compactHeaderHeight = COMPACT_HEADER_HEIGHT + insets.top;

  const handleEdit = useCallback(() => {
    if (identityKey) router.navigate(Routes.tabs.editProfile(identityKey));
  }, [identityKey]);

  // Hands over as the full header's own tabs leave the screen.
  const revealAt = Math.max(0, headerHeight - compactHeaderHeight);
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
    transform: [{ translateY: -compactHeaderHeight * (1 - progress.value) }],
  }));

  // Clamped to [0, 1]; overscroll keeps it hidden.
  const statusBarCoverStyle = useAnimatedStyle(() => ({
    opacity: Math.min(
      1,
      Math.max(0, scrollY.value / STATUS_BAR_COVER_FADE_DISTANCE),
    ),
  }));

  return (
    <>
      {/* The screen draws under the status bar; this covers it once scrolled. */}
      <Animated.View
        pointerEvents="none"
        style={[
          Atoms.absolute,
          {
            top: 0,
            left: 0,
            right: 0,
            height: insets.top,
            zIndex: ZIndex.raised,
            backgroundColor: theme.palette.neutral_0,
          },
          statusBarCoverStyle,
        ]}
      />
      <Animated.View
        style={[
          Atoms.absolute,
          {
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top,
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
          {/* Takes the free space, so the name and its badge stay left. */}
          <View style={[Atoms.flex_1, { minWidth: 0 }]}>
            <Username identity={identityKey} variant="body" fontWeight="bold" />
          </View>
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
    </>
  );
}

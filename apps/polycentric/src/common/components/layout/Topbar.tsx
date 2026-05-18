import { Link, router, useSegments } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Atoms, Spacing, useTheme, withHexOpacity } from '../../theme';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import WEB_LOGO from '../../assets/images/PolycentricLogoTransparent256.png';
import { ProfileAvatar, Text } from '../primitives';
import { useCurrentIdentity } from '../../lib/polycentric-hooks';
import { memo, useState, type ReactNode } from 'react';

const SIDE_WIDTH = 32;

type TopbarProps = {
  title?: string;
  /**
   * Replaces the default centred title/logo. Use this when the centre
   * slot needs a non-navigational element (e.g. a search bar).
   */
  center?: ReactNode;
  /** Content rendered on the right side, mirroring the avatar slot. */
  right?: ReactNode;
};

function Topbar({ title, center, right }: TopbarProps) {
  const { identity: currentIdentity } = useCurrentIdentity();
  const { theme } = useTheme();

  const segments = useSegments();
  const [isTabRoot] = useState(
    () => segments[0] === '(tabs)' && segments.length === 2,
  );
  const canGoBack = !isTabRoot;

  const identityKey = currentIdentity?.identityKey ?? null;

  return (
    <View
      style={[
        Atoms.w_full,
        Atoms.align_center,
        Atoms.flex_row,
        Atoms.px_md,
        Atoms.py_sm,
        Atoms.gap_md,
        { height: 60 },
        { backgroundColor: theme.palette.neutral_0 },
        {
          borderBottomWidth: 1,
          borderBottomColor: withHexOpacity(theme.palette.neutral_500, '10'),
        },
      ]}
    >
      <View
        style={[
          !!right && { width: SIDE_WIDTH },
          Atoms.justify_center,
          Atoms.items_start,
        ]}
      >
        {canGoBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={Spacing['lg']}
            style={({ pressed }) => [pressed && { opacity: 0.5 }]}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={theme.palette.neutral_900}
            />
          </Pressable>
        ) : (
          <ProfileAvatar
            identityKey={identityKey ?? ''}
            size="sm"
            containerProps={{ hitSlop: Spacing['lg'] }}
            onPress={
              identityKey
                ? () =>
                    router.push({
                      pathname: '/profile/[identityId]',
                      params: { identityId: identityKey },
                    })
                : undefined
            }
          />
        )}
      </View>
      <View
        style={[
          Atoms.flex_1,
          Atoms.align_center,
          Atoms.flex_row,
          Atoms.justify_center,
        ]}
      >
        {center ??
          (title ? (
            <Text variant="title">{title}</Text>
          ) : (
            <Link href={{ pathname: '/' }}>
              <Image
                source={WEB_LOGO}
                contentFit="contain"
                style={[{ width: 36, height: 36 }, Atoms.self_center]}
              />
            </Link>
          ))}
      </View>
      <View
        style={[
          !right && { width: SIDE_WIDTH },
          Atoms.justify_center,
          Atoms.items_end,
        ]}
      >
        {right}
      </View>
    </View>
  );
}

export default memo(Topbar);

import { ProfileAvatar, Text } from '@/src/common/components/primitives';
import { openCompose } from '@/src/common/constants';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

/**
 * A non-interactive placeholder that looks like a composer input. Tapping
 * anywhere on it opens the full compose modal.
 */
export function ComposerInput() {
  const { identity: currentIdentity } = useCurrentIdentity();
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();
  const {
    hovered: attachHovered,
    onHoverIn: onAttachHoverIn,
    onHoverOut: onAttachHoverOut,
  } = useWebHover();

  if (!currentIdentity?.identityKey) return null;

  const hoverOverlay =
    theme.scheme === 'light'
      ? withHexOpacity(theme.palette.neutral_500, '14')
      : withHexOpacity(theme.palette.black, '28');

  return (
    <Pressable
      accessibilityLabel="New post"
      onPress={() => openCompose()}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={[
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.gap_lg,
        Atoms.px_lg,
        Atoms.py_md,
        {
          borderBottomWidth: 1,
          borderBottomColor: withHexOpacity(theme.palette.neutral_500, '40'),
          backgroundColor: theme.palette.neutral_0,
          overflow: 'hidden',
        },
      ]}
    >
      <ProfileAvatar identityKey={currentIdentity.identityKey} size="md" />
      <Text variant="body" color="neutral_500" style={Atoms.flex_1}>
        What&apos;s on your mind?
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attach image"
        onPress={(e) => {
          e.stopPropagation?.();
          openCompose({ attachImage: true });
        }}
        onHoverIn={onAttachHoverIn}
        onHoverOut={onAttachHoverOut}
        hitSlop={8}
        style={[
          Atoms.p_xs,
          Atoms.rounded_md,
          {
            backgroundColor: attachHovered
              ? withHexOpacity(theme.palette.neutral_500, '20')
              : 'transparent',
          },
        ]}
      >
        <Ionicons
          name="image-outline"
          size={22}
          color={theme.palette.neutral_700}
        />
      </Pressable>
      {hovered ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: hoverOverlay }]}
        />
      ) : null}
    </Pressable>
  );
}

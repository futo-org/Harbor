import { ProfileAvatar, Text } from '@/src/common/components/primitives';
import { openCompose } from '@/src/common/constants';
import {
  type PostData,
  useCurrentIdentity,
} from '@/src/common/lib/polycentric-hooks';
import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, useTheme } from '@/src/common/theme';
import Icon from '@/src/common/components/Icon';
import { Pressable } from 'react-native';

interface ComposerInputProps {
  /** When set, opens the composer pre-filled to reply to this post. */
  replyTo?: PostData['id'];
}

/**
 * A non-interactive placeholder that looks like a composer input. Tapping
 * anywhere on it opens the full compose modal.
 */
export function ComposerInput({ replyTo }: ComposerInputProps = {}) {
  const { identity: currentIdentity } = useCurrentIdentity();
  const { theme } = useTheme();
  const {
    hovered: attachHovered,
    onHoverIn: onAttachHoverIn,
    onHoverOut: onAttachHoverOut,
  } = useWebHover();

  if (!currentIdentity?.identityKey) return null;

  return (
    <Pressable
      accessibilityLabel="New post"
      onPress={() => openCompose({ replyTo })}
      style={[
        Atoms.flex_row,
        Atoms.items_center,
        // Same as Post, so the avatar and text line up with the posts around it
        Atoms.gap_md,
        Atoms.px_md,
        Atoms.py_md,
        theme.atoms_new.box.primary.bg,
        theme.atoms_new.box.primary.border,
        { borderBottomWidth: 1 },
      ]}
    >
      <ProfileAvatar identityKey={currentIdentity.identityKey} size="md" />
      <Text variant="body" color="muted" style={Atoms.flex_1}>
        {replyTo ? 'Post your reply' : "What's on your mind?"}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Attach image"
        onPress={(e) => {
          e.stopPropagation?.();
          openCompose({ attachImage: true, replyTo });
        }}
        onHoverIn={onAttachHoverIn}
        onHoverOut={onAttachHoverOut}
        hitSlop={8}
        style={[
          Atoms.p_xs,
          Atoms.rounded_md,
          attachHovered && theme.atoms_new.box.neutral.bg_subtle,
        ]}
      >
        <Icon name="image" size={22} color="secondary" />
      </Pressable>
    </Pressable>
  );
}

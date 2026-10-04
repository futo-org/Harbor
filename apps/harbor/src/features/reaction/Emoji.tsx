import { Atoms } from '@/src/common/theme';
import { EmojiImage } from '@/src/common/components/EmojiImage';
import { isWeb } from '@/src/common/util/platform';
import { memo, useCallback, type ReactNode } from 'react';
import type { Insets, StyleProp, ViewStyle } from 'react-native';
import { Pressable, View } from 'react-native';

// Scale/timing/opacity for the hover (on web) and press (on native) animations.
export const EMOJI_POP_SCALE = 1.12;
export const EMOJI_POP_MS = 120;
export const EMOJI_PRESS_OPACITY = 0.6;
/** Glyph size as a fraction of a numerically sized emoji cell. */
export const EMOJI_IMAGE_SCALE = 0.62;

// Web-only: transition descriptors for the Pressable style render functions.
const WEB_BACKGROUND_TRANSITION: ViewStyle = {
  transitionProperty: 'background-color',
  transitionDuration: `${EMOJI_POP_MS}ms`,
};
const WEB_TRANSFORM_TRANSITION: ViewStyle = {
  transitionProperty: 'transform',
  transitionDuration: `${EMOJI_POP_MS}ms`,
};

type EmojiLikePressableProps = {
  onPress: () => void;
  highlightColor: string;
  selected?: boolean;
  /** Width/height of the button */
  size?: string | number;
  /** Extends the touch target beyond the visual bounds on native. */
  hitSlop?: number | Insets;
  children: ReactNode;
};

/**
 * A rounded, centered Pressable with hover/press animation. The button itself
 * only changes color/opacity; the pop scale is applied to its content so the
 * highlight keeps its size.
 */
function EmojiLikePressable({
  onPress,
  children,
  highlightColor,
  selected = false,
  size,
  hitSlop,
}: EmojiLikePressableProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      style={(state) => [
        Atoms.rounded_full,
        Atoms.align_center,
        Atoms.justify_center,
        size ? { width: size, aspectRatio: 1 } : undefined,
        isWeb ? WEB_BACKGROUND_TRANSITION : undefined,
        selected ? { backgroundColor: highlightColor } : undefined,
        isWeb
          ? state.hovered || state.pressed
            ? { backgroundColor: highlightColor }
            : undefined
          : state.pressed
            ? { opacity: EMOJI_PRESS_OPACITY }
            : undefined,
      ]}
    >
      {(state) => (
        <View
          style={[
            isWeb ? WEB_TRANSFORM_TRANSITION : undefined,
            (isWeb ? state.hovered || state.pressed : state.pressed)
              ? { transform: [{ scale: EMOJI_POP_SCALE }] }
              : undefined,
          ]}
        >
          {children}
        </View>
      )}
    </Pressable>
  );
}

type EmojiProps = {
  emoji: string;
  /** Click handler for when an emoji button is pressed */
  onSelect: (value: string) => void;
  value?: string;
  selected?: boolean;
  /** Width/height of the button */
  size?: string | number;
  // Passed as a prop to avoid frequent theme subscriptions
  highlightColor: string;
  style?: StyleProp<ViewStyle>;
};

export const Emoji = memo(function Emoji({
  style,
  emoji,
  onSelect,
  value,
  selected = false,
  size,
  highlightColor,
}: EmojiProps) {
  const handlePress = useCallback(
    () => onSelect(value ?? emoji),
    [onSelect, value, emoji],
  );
  const isNumericSize = typeof size === 'number';

  return (
    <EmojiLikePressable
      onPress={handlePress}
      size={size}
      highlightColor={highlightColor}
      selected={selected}
    >
      <View style={style}>
        <EmojiImage
          sequence={emoji}
          size={isNumericSize ? Math.round(size * EMOJI_IMAGE_SCALE) : 28}
        />
      </View>
    </EmojiLikePressable>
  );
});

type EmojiLikeButtonProps = {
  onPress: () => void;
  highlightColor: string;
  children: ReactNode;
  size?: number;
  /** Extends the touch target beyond the visual bounds on native. */
  hitSlop?: number | Insets;
};

/** Circular button styled similar to an emoji button, for use outside of the emoji grid. */
export function EmojiLikeButton({
  onPress,
  highlightColor,
  children,
  size,
  hitSlop,
}: EmojiLikeButtonProps) {
  return (
    <EmojiLikePressable
      onPress={onPress}
      size={size}
      hitSlop={hitSlop}
      highlightColor={highlightColor}
    >
      {children}
    </EmojiLikePressable>
  );
}

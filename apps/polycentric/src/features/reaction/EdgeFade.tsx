import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type EdgeFadeProps = {
  /** Thickness of the fade: its height when vertical, its width when horizontal. */
  size: number;
  /** Unique gradient id. Must differ per instance to avoid SVG url(#id) collisions. */
  id: string;
  /** Which edge to fade out against: the bottom, or the right when horizontal. */
  direction?: 'vertical' | 'horizontal';
};

/**
 * Fade overlay for the scrolling edge of a container.
 */
export function EdgeFade({ size, id, direction = 'vertical' }: EdgeFadeProps) {
  const { theme } = useTheme();
  const color = theme.palette.neutral_0;
  const horizontal = direction === 'horizontal';

  return (
    <View
      pointerEvents="none"
      style={[
        Atoms.absolute,
        horizontal
          ? { top: 0, bottom: 0, right: 0, width: size }
          : { left: 0, right: 0, bottom: 0, height: size },
      ]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient
            id={id}
            x1="0"
            y1="0"
            x2={horizontal ? '1' : '0'}
            y2={horizontal ? '0' : '1'}
          >
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="0.8" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type BottomFadeProps = {
  height: number;
  /** Unique gradient id. Must differ per instance to avoid SVG url(#id) collisions. */
  id: string;
};

/** Fade overlay for the bottom of a scroll container. */
export function BottomFade({ height, id }: BottomFadeProps) {
  const { theme } = useTheme();
  const color = theme.palette.neutral_0;

  return (
    <View
      pointerEvents="none"
      style={[Atoms.absolute, { left: 0, right: 0, bottom: 0, height }]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
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

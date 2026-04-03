import { useMemo, ReactNode } from 'react';
import {
  View,
  DimensionValue,
  ViewProps,
  ViewStyle,
  StyleProp,
} from 'react-native';

/**
 * Layout shell with optional explicit dimensions. Put everything else in `style`:
 * usually `Atoms.*` for common patterns (`flex_1`, rows, gaps, padding, …).
 *
 * For layouts atoms do not cover — e.g. `flex: 2`, `flexBasis`, grow/shrink combos,
 * or one-off flex rules — still use `Box` and pass those in `style` (alone or
 * merged with atoms). Most UIs stay simple enough that atoms are enough; richer
 * flex is optional and lives in `style` when needed.
 */
interface BoxProps extends ViewProps {
  children?: ReactNode;
  height?: DimensionValue;
  width?: DimensionValue;
  minHeight?: DimensionValue;
  minWidth?: DimensionValue;
  maxHeight?: DimensionValue;
  maxWidth?: DimensionValue;
  style?: StyleProp<ViewStyle>;
}

export function Box({
  children,
  height,
  width,
  minHeight,
  minWidth,
  maxHeight,
  maxWidth,
  style,
  ...props
}: BoxProps) {
  const boxStyle = useMemo(() => {
    const s: ViewStyle = {};

    if (height !== undefined) s.height = height;
    if (width !== undefined) s.width = width;
    if (minHeight !== undefined) s.minHeight = minHeight;
    if (minWidth !== undefined) s.minWidth = minWidth;
    if (maxHeight !== undefined) s.maxHeight = maxHeight;
    if (maxWidth !== undefined) s.maxWidth = maxWidth;

    return s;
  }, [height, width, minHeight, minWidth, maxHeight, maxWidth]);

  return (
    <View style={[boxStyle, style]} {...props}>
      {children}
    </View>
  );
}

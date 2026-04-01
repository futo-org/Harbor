import { useMemo, ReactNode } from 'react';
import {
  View,
  DimensionValue,
  ViewProps,
  ViewStyle,
  StyleProp,
} from 'react-native';
import {
  useLegacyTheme,
  SpacingToken,
  BorderRadiusToken,
  ColorToken,
} from '@/legacyTheme';

interface BoxProps extends ViewProps {
  children?: ReactNode;
  backgroundColor?: ColorToken;
  borderRadius?: BorderRadiusToken;
  margin?: SpacingToken;
  marginTop?: SpacingToken;
  marginBottom?: SpacingToken;
  marginLeft?: SpacingToken;
  marginRight?: SpacingToken;
  marginHorizontal?: SpacingToken;
  marginVertical?: SpacingToken;
  padding?: SpacingToken;
  paddingTop?: SpacingToken;
  paddingBottom?: SpacingToken;
  paddingLeft?: SpacingToken;
  paddingRight?: SpacingToken;
  paddingHorizontal?: SpacingToken;
  paddingVertical?: SpacingToken;
  gap?: SpacingToken;
  height?: DimensionValue;
  width?: DimensionValue;
  minHeight?: DimensionValue;
  minWidth?: DimensionValue;
  maxHeight?: DimensionValue;
  maxWidth?: DimensionValue;
  flex?: ViewStyle['flex'];
  flexDirection?: ViewStyle['flexDirection'];
  alignItems?: ViewStyle['alignItems'];
  alignSelf?: ViewStyle['alignSelf'];
  justifyContent?: ViewStyle['justifyContent'];
  flexWrap?: ViewStyle['flexWrap'];
  style?: StyleProp<ViewStyle>;
}

export function Box({
  children,
  gap,
  margin,
  marginTop,
  marginBottom,
  marginLeft,
  marginRight,
  marginHorizontal,
  marginVertical,
  padding,
  paddingTop,
  paddingBottom,
  paddingLeft,
  paddingRight,
  paddingHorizontal,
  paddingVertical,
  height,
  width,
  minHeight,
  minWidth,
  maxHeight,
  maxWidth,
  flex,
  flexDirection,
  alignItems,
  alignSelf,
  justifyContent,
  flexWrap,
  backgroundColor,
  borderRadius,
  style,
  ...props
}: BoxProps) {
  const { legacyTheme } = useLegacyTheme();

  const boxStyle = useMemo(() => {
    const s: ViewStyle = {};

    if (flex !== undefined) s.flex = flex;
    if (flexDirection) s.flexDirection = flexDirection;
    if (alignItems) s.alignItems = alignItems;
    if (alignSelf) s.alignSelf = alignSelf;
    if (justifyContent) s.justifyContent = justifyContent;
    if (flexWrap) s.flexWrap = flexWrap;

    if (gap) s.gap = legacyTheme.spacing[gap];
    if (margin) s.margin = legacyTheme.spacing[margin];
    if (marginTop) s.marginTop = legacyTheme.spacing[marginTop];
    if (marginBottom) s.marginBottom = legacyTheme.spacing[marginBottom];
    if (marginLeft) s.marginLeft = legacyTheme.spacing[marginLeft];
    if (marginRight) s.marginRight = legacyTheme.spacing[marginRight];
    if (marginHorizontal)
      s.marginHorizontal = legacyTheme.spacing[marginHorizontal];
    if (marginVertical) s.marginVertical = legacyTheme.spacing[marginVertical];
    if (padding) s.padding = legacyTheme.spacing[padding];
    if (paddingTop) s.paddingTop = legacyTheme.spacing[paddingTop];
    if (paddingBottom) s.paddingBottom = legacyTheme.spacing[paddingBottom];
    if (paddingLeft) s.paddingLeft = legacyTheme.spacing[paddingLeft];
    if (paddingRight) s.paddingRight = legacyTheme.spacing[paddingRight];
    if (paddingHorizontal)
      s.paddingHorizontal = legacyTheme.spacing[paddingHorizontal];
    if (paddingVertical)
      s.paddingVertical = legacyTheme.spacing[paddingVertical];

    if (height !== undefined) s.height = height;
    if (width !== undefined) s.width = width;
    if (minHeight !== undefined) s.minHeight = minHeight;
    if (minWidth !== undefined) s.minWidth = minWidth;
    if (maxHeight !== undefined) s.maxHeight = maxHeight;
    if (maxWidth !== undefined) s.maxWidth = maxWidth;

    if (backgroundColor)
      s.backgroundColor = legacyTheme.colors[backgroundColor];
    if (borderRadius) s.borderRadius = legacyTheme.borderRadius[borderRadius];

    return s;
  }, [
    flex,
    flexDirection,
    alignItems,
    alignSelf,
    justifyContent,
    flexWrap,
    gap,
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginHorizontal,
    marginVertical,
    padding,
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    paddingHorizontal,
    paddingVertical,
    height,
    width,
    minHeight,
    minWidth,
    maxHeight,
    maxWidth,
    backgroundColor,
    borderRadius,
  ]);

  return (
    <View style={[boxStyle, style]} {...props}>
      {children}
    </View>
  );
}

import { Atoms } from '@/src/common/theme';
import React from 'react';
import {
  type ScrollViewProps as RNScrollViewProps,
  StyleSheet,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { HidingHeader, renderNode, useHidingHeader } from './HidingHeader';

export type ScrollViewProps = RNScrollViewProps & {
  /**
   * A sticky header that hides as you scroll down
   */
  HeaderComponent?:
    | React.ComponentType<unknown>
    | React.ReactElement
    | null
    | undefined;
};

export function ScrollView({
  HeaderComponent,
  contentContainerStyle,
  onScroll: _ignoredOnScroll,
  children,
  ...rest
}: ScrollViewProps) {
  const { onScroll, headerHeight, headerAnimatedStyle, onHeaderLayout } =
    useHidingHeader();

  const header = renderNode(HeaderComponent);

  return (
    <View style={Atoms.flex_1}>
      {header ? (
        <HidingHeader style={headerAnimatedStyle} onLayout={onHeaderLayout}>
          {header}
        </HidingHeader>
      ) : null}

      <Animated.ScrollView
        {...rest}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={StyleSheet.flatten([
          { paddingTop: headerHeight },
          contentContainerStyle,
        ])}
      >
        {children}
      </Animated.ScrollView>
    </View>
  );
}

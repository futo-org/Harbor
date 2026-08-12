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

export const ScrollView = React.forwardRef<
  Animated.ScrollView,
  ScrollViewProps
>(function ScrollView(
  {
    HeaderComponent,
    contentContainerStyle,
    onScroll: _ignoredOnScroll,
    children,
    ...rest
  },
  ref,
) {
  const {
    onScroll,
    headerAnimatedStyle,
    onHeaderLayout,
    scrollProps,
    contentPaddingTop,
  } = useHidingHeader();

  const header = renderNode(HeaderComponent);

  return (
    <View style={Atoms.flex_1}>
      {header ? (
        <HidingHeader style={headerAnimatedStyle} onLayout={onHeaderLayout}>
          {header}
        </HidingHeader>
      ) : null}

      <Animated.ScrollView
        ref={ref}
        {...rest}
        {...scrollProps}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={StyleSheet.flatten([
          { paddingTop: contentPaddingTop },
          contentContainerStyle,
        ])}
      >
        {children}
      </Animated.ScrollView>
    </View>
  );
});

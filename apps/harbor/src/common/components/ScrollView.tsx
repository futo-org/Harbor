import React from 'react';
import { type ScrollViewProps as RNScrollViewProps, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { HidingHeaderStack, renderNode, useHidingHeader } from './HidingHeader';

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
  const { onScroll, onHeaderLayout, stackStyle, scrollableStyle } =
    useHidingHeader();

  const header = renderNode(HeaderComponent);

  return (
    <HidingHeaderStack style={stackStyle}>
      {header ? <View onLayout={onHeaderLayout}>{header}</View> : null}

      <Animated.ScrollView
        ref={ref}
        {...rest}
        style={scrollableStyle}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={contentContainerStyle}
      >
        {children}
      </Animated.ScrollView>
    </HidingHeaderStack>
  );
});

import React from 'react';
import {
  type ScrollViewProps as RNScrollViewProps,
  StyleSheet,
} from 'react-native';
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
  const {
    onScroll,
    onHeaderLayout,
    translateStyle,
    headerHeight,
    contentPaddingTop,
  } = useHidingHeader();

  const header = renderNode(HeaderComponent);

  return (
    <HidingHeaderStack
      header={header}
      headerHeight={headerHeight}
      onHeaderLayout={onHeaderLayout}
      style={translateStyle}
    >
      <Animated.ScrollView
        ref={ref}
        {...rest}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={StyleSheet.flatten([
          { paddingTop: contentPaddingTop },
          contentContainerStyle,
        ])}
      >
        {children}
      </Animated.ScrollView>
    </HidingHeaderStack>
  );
});

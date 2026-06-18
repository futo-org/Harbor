import {
  FlashList,
  FlashListRef,
  type FlashListProps,
  type ListRenderItem,
  type ListRenderItemInfo,
} from '@shopify/flash-list';
import React, {
  cloneElement,
  forwardRef,
  isValidElement,
  useImperativeHandle,
  useRef,
} from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Atoms } from '../theme';
import { HidingHeader, renderNode, useHidingHeader } from './HidingHeader';

// A reanimated-compatible FlashList.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

export type { FlashListProps, ListRenderItem, ListRenderItemInfo };

export type ListProps<T> = FlashListProps<T> & {
  HeaderComponent?:
    | React.ComponentType<any>
    | React.ReactElement<unknown, string | React.JSXElementConstructor<any>>
    | React.ExoticComponent<any>
    | null
    | undefined;
};

/** Imperative handle exposed by `List` (and `FeedList`). */
export type ListRef = { scrollToTop: () => void };

export const List = forwardRef(function List<T>(
  {
    HeaderComponent,
    contentContainerStyle,
    refreshControl,
    onScroll: _ignoredOnScroll,
    ...rest
  }: ListProps<T>,
  ref: React.Ref<ListRef>,
) {
  const flashListRef = useRef<FlashListRef<T>>(null);
  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: () =>
        flashListRef.current?.scrollToOffset({ offset: 0, animated: true }),
    }),
    [],
  );

  const { onScroll, headerHeight, headerAnimatedStyle, onHeaderLayout } =
    useHidingHeader();

  const renderedHeader = renderNode(HeaderComponent);

  // Show below the sticky header
  const adjustedRefreshControl = (
    isValidElement(refreshControl)
      ? cloneElement(
          refreshControl as React.ReactElement<{ progressViewOffset?: number }>,
          {
            progressViewOffset: headerHeight,
          },
        )
      : refreshControl
  ) as FlashListProps<T>['refreshControl'];

  return (
    <View style={[Atoms.flex_1]}>
      {renderedHeader ? (
        <HidingHeader style={headerAnimatedStyle} onLayout={onHeaderLayout}>
          {renderedHeader}
        </HidingHeader>
      ) : null}

      <AnimatedFlashList
        ref={flashListRef as React.Ref<FlashListRef<unknown>>}
        {...(rest as FlashListProps<unknown>)}
        refreshControl={adjustedRefreshControl}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: headerHeight,
          ...(typeof contentContainerStyle === 'object' &&
          contentContainerStyle !== null
            ? contentContainerStyle
            : {}),
        }}
      />
    </View>
  );
}) as <T>(
  props: ListProps<T> & { ref?: React.Ref<ListRef> },
) => React.ReactElement;

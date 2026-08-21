import {
  FlashList,
  type FlashListRef,
  type FlashListProps,
} from '@shopify/flash-list';
import type React from 'react';
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Atoms } from '../../theme';
import {
  HidingHeaderStack,
  renderNode,
  useHidingHeader,
} from '../HidingHeader';
import { useForwardedScroll } from '../ScrollForwarder';
import type { ListProps, ListRef } from './types';

// A reanimated-compatible FlashList.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList);

// FlashList re-anchors to the old first row when items are prepended;
// disabled so a refresh at the top shows the new content.
const MAINTAIN_VISIBLE_CONTENT_POSITION_DISABLED = { disabled: true };

export const List = forwardRef(function List<T>(
  props: ListProps<T>,
  ref: React.Ref<ListRef>,
) {
  return <NativeList<T> {...props} listRef={ref} />;
}) as <T>(
  props: ListProps<T> & { ref?: React.Ref<ListRef> },
) => React.ReactElement;

function NativeList<T>({
  HeaderComponent,
  initialHeaderHeight = 0,
  contentContainerStyle,
  refreshControl,
  onScroll: _ignoredOnScroll,
  listRef,
  scrollY,
  maintainVisibleContentPosition = MAINTAIN_VISIBLE_CONTENT_POSITION_DISABLED,
  ...rest
}: ListProps<T> & { listRef?: React.Ref<ListRef> }) {
  const ref = useRef<FlashListRef<T>>(null);
  // A `ScrollForwarder` above owns the header; without one the list hides
  // its own.
  const forwarded = useForwardedScroll();
  const hiding = useHidingHeader(initialHeaderHeight, scrollY);
  const { onHeaderLayout, translateStyle, headerHeight } = hiding;
  const onScroll = forwarded ? forwarded.onScroll : hiding.onScroll;
  const contentPaddingTop = forwarded
    ? forwarded.contentPaddingTop
    : hiding.contentPaddingTop;

  useImperativeHandle(
    listRef,
    () => ({
      scrollToTop: ({ animated = true } = {}) =>
        ref.current?.scrollToOffset({ offset: 0, animated }),
    }),
    [],
  );

  // Lets the header's owner align this list's offset with it.
  const register = forwarded?.register;
  useEffect(() => {
    if (!register) return;
    register({
      scrollToOffset: (offset) =>
        ref.current?.scrollToOffset({ offset, animated: false }),
      getScrollOffset: () => ref.current?.getAbsoluteLastScrollOffset() ?? 0,
    });
    return () => register(null);
  }, [register]);

  const renderedHeader = renderNode(HeaderComponent);

  // A new style object each render invalidates FlashList's layout cache.
  const mergedContentContainerStyle = useMemo(
    () => ({
      ...Atoms.flex_grow_1,
      paddingTop: contentPaddingTop,
      ...(typeof contentContainerStyle === 'object' &&
      contentContainerStyle !== null
        ? contentContainerStyle
        : {}),
    }),
    [contentPaddingTop, contentContainerStyle],
  );

  // Positions Android's refresh spinner; iOS ignores it.
  const adjustedRefreshControl = (
    isValidElement(refreshControl)
      ? cloneElement(
          refreshControl as React.ReactElement<{ progressViewOffset?: number }>,
          { progressViewOffset: contentPaddingTop },
        )
      : refreshControl
  ) as FlashListProps<T>['refreshControl'];

  const list = (
    <AnimatedFlashList
      ref={ref as React.Ref<FlashListRef<unknown>>}
      {...(rest as FlashListProps<unknown>)}
      maintainVisibleContentPosition={maintainVisibleContentPosition}
      refreshControl={adjustedRefreshControl}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={mergedContentContainerStyle}
    />
  );

  if (forwarded) return <View style={Atoms.flex_1}>{list}</View>;

  return (
    <HidingHeaderStack
      header={renderedHeader}
      headerHeight={headerHeight}
      onHeaderLayout={onHeaderLayout}
      style={translateStyle}
    >
      {list}
    </HidingHeaderStack>
  );
}

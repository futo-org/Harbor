import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { isWeb } from '@/src/common/util/platform';
import {
  FlashList,
  type FlashListProps,
  type ListRenderItem,
  type ListRenderItemInfo,
} from '@shopify/flash-list';
import { isValidElement, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Post } from './Post';

export type { FlashListProps, ListRenderItem, ListRenderItemInfo };

// `renderItem` is required by FlashList but FeedViewer defaults it to a
// `Post` renderer for `PostData`, so consumers can omit it.
export type FeedViewerProps<T = PostData> = Omit<
  FlashListProps<T>,
  'renderItem'
> & {
  renderItem?: FlashListProps<T>['renderItem'];
};

const defaultRenderItem: ListRenderItem<PostData> = ({ item }) => (
  <Post post={item} />
);

const defaultKeyExtractor = (item: PostData, index: number) =>
  `${item.id}:${index}`;

export function FeedViewer<T extends PostData = PostData>(
  props: FeedViewerProps<T>,
) {
  const renderItem =
    (props.renderItem as ListRenderItem<T>) ??
    (defaultRenderItem as unknown as ListRenderItem<T>);
  const keyExtractor =
    props.keyExtractor ??
    (defaultKeyExtractor as unknown as FlashListProps<T>['keyExtractor']);

  if (isWeb) {
    return (
      <WebFeedViewer<T>
        {...props}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
      />
    );
  }

  return (
    <FlashList<T>
      {...props}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
    />
  );
}

// Renders the FlashList contract inline so the page-level scroll on web
// is preserved (the Stack content area already has `overflow: auto`).
// Only the props the feed actually uses are honored.
function WebFeedViewer<T>({
  data,
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  onEndReached,
  contentContainerStyle,
}: FlashListProps<T>) {
  const sentinelRef = useRef<View>(null);
  const items = (data as readonly T[] | null | undefined) ?? [];

  useEffect(() => {
    if (!onEndReached) return;
    const node = sentinelRef.current as unknown as Element | null;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onEndReached();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onEndReached, items.length]);

  const isEmpty = items.length === 0;

  return (
    <View style={contentContainerStyle}>
      {renderNode(ListHeaderComponent)}
      {isEmpty
        ? renderNode(ListEmptyComponent)
        : items.map((item, index) => {
            const key =
              typeof keyExtractor === 'function'
                ? keyExtractor(item, index)
                : `${index}`;
            return (
              <View key={key}>
                {renderItem?.({
                  item,
                  index,
                  target: 'Cell',
                  extraData: undefined,
                }) ?? null}
              </View>
            );
          })}
      {onEndReached && !isEmpty ? (
        <View ref={sentinelRef} style={{ height: 1 }} />
      ) : null}
      {renderNode(ListFooterComponent)}
    </View>
  );
}

type ReactNodeOrComponent =
  | React.ReactElement
  | React.ComponentType
  | null
  | undefined;

function renderNode(node: ReactNodeOrComponent) {
  if (node == null) return null;
  if (isValidElement(node)) return node;
  const Component = node as React.ComponentType;
  return <Component />;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Post } from './Post';
import { useOrderedThread } from './hooks/useOrderedThread';
import { useThread } from './hooks/useThread';
import { Atoms, useTheme } from '@/src/common/theme';
import { ComposerInput } from '../composer';
import { List, type ListProps } from '@/src/common/components/List';
import { renderNode } from '@/src/common/components/HidingHeader';
import { isWeb } from '@/src/common/util/platform';

type ThreadListProps = Omit<ListProps<PostData>, 'data' | 'renderItem'> & {
  post: PostData;
};

/** Time for the list to place the subject once the thread lands. */
const SETTLE_MS = 120;

export function ThreadList({
  post,
  HeaderComponent,
  ...rest
}: ThreadListProps) {
  const { theme } = useTheme();
  const thread = useThread(post);

  // Subject alone first; `maintainVisibleContentPosition` holds it after.
  const [isFirstLayoutComplete, setIsFirstLayoutComplete] = useState(false);

  const subjectOnly = useMemo(() => [post], [post]);
  const orderedItems = useOrderedThread(post, thread.items);
  const items = isFirstLayoutComplete ? orderedItems : subjectOnly;

  const subjectIndex = items.findIndex((p) => p.id === post.id);

  // Native scrolls the subject to the top. Fill only the shortfall.
  const { height: windowHeight } = useWindowDimensions();
  const rowHeights = useRef(new Map<string, number>());
  const [, setMeasureTick] = useState(0);
  const measureRow = useCallback((id: string, event: LayoutChangeEvent) => {
    if (isWeb) return;
    const height = event.nativeEvent.layout.height;
    if (rowHeights.current.get(id) === height) return;
    rowHeights.current.set(id, height);
    setMeasureTick((tick) => tick + 1);
  }, []);

  // Rows from the subject down.
  const belowHeight =
    subjectIndex < 0
      ? 0
      : items
          .slice(subjectIndex)
          .reduce((sum, p) => sum + (rowHeights.current.get(p.id) ?? 0), 0);
  const filler = isWeb ? 0 : Math.max(0, windowHeight - belowHeight);

  // Parents shift the subject by a height the list can only estimate, so
  // cover the list until it has placed.
  const [settling, setSettling] = useState(!isWeb);
  useEffect(() => {
    if (isWeb || thread.isLoading) return;
    const timer = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [thread.isLoading]);

  return (
    <View style={Atoms.flex_1}>
      <List
        {...rest}
        HeaderComponent={HeaderComponent}
        data={items}
        // Keeps the subject anchored while parents load in above it.
        maintainVisibleContentPosition={{ disabled: false }}
        initialScrollIndex={subjectIndex > 0 ? subjectIndex : undefined}
        onLoad={() => setIsFirstLayoutComplete(true)}
        keyExtractor={(p) => p.id}
        // The subject carries the composer; its height must not become the
        // estimate for parents arriving above it.
        getItemType={(p) => (p.id === post.id ? 'subject' : 'post')}
        renderItem={({ item, index }) => {
          const above = index > 0 ? items[index - 1] : null;
          const below = index < items.length - 1 ? items[index + 1] : null;
          const lineAbove =
            !!above &&
            item.reply?.parentId === above.id &&
            above.id !== post.id;
          const lineBelow = !!below && below.reply?.parentId === item.id;

          const isSubject = item.id === post.id;
          return (
            <View
              style={[Atoms.w_full]}
              onLayout={(event) => measureRow(item.id, event)}
            >
              <Post
                post={item}
                hideReplyingTo={true}
                focusedView={isSubject}
                disablePress={isSubject}
                showThreadLineAbove={lineAbove}
                showThreadLineBelow={lineBelow && !isSubject}
                hideBottomBorder={lineBelow && !isSubject}
              />
              {isSubject ? <ComposerInput replyTo={post.id} /> : null}
            </View>
          );
        }}
        // Web sizes its own anchor space.
        ListFooterComponent={
          filler > 0 ? <View style={{ height: filler }} /> : undefined
        }
        refreshControl={
          !isWeb ? (
            <RefreshControl
              refreshing={thread.isRefreshing}
              onRefresh={thread.refresh}
            />
          ) : undefined
        }
      />
      {settling ? (
        <View style={[Atoms.absolute, Atoms.inset_0, theme.atoms.bg]}>
          {renderNode(HeaderComponent)}
          <Post post={post} hideReplyingTo={true} focusedView disablePress />
          <ComposerInput replyTo={post.id} />
        </View>
      ) : null}
    </View>
  );
}

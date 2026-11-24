import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PostData } from '@/src/common/lib/polycentric-hooks';
import { Post } from './Post';
import { useOrderedThread } from './hooks/useOrderedThread';
import { useThread } from './hooks/useThread';
import { Atoms, useTheme } from '@/src/common/theme';
import { ComposerInput } from '../composer';
import {
  List,
  type ListProps,
  type ListRef,
} from '@/src/common/components/List';
import { renderNode } from '@/src/common/components/HidingHeader';
import { Button } from '@/src/common/components/primitives';
import { isWeb } from '@/src/common/util/platform';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';

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
  const insets = useSafeAreaInsets();
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

  const filler = isWeb
    ? 0
    : Math.max(insets.bottom, windowHeight - belowHeight);

  // Parents shift the subject by a height the list can only estimate, so
  // native covers the list until it has placed.
  const [settling, setSettling] = useState(true);
  useEffect(() => {
    if (thread.isLoading) return;
    const timer = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [thread.isLoading]);

  // Points at the parent above the anchored subject. Waits for the list to
  // place the subject, since that can scroll up too.
  const listRef = useRef<ListRef>(null);
  const { scrollY, isScrollHintVisible } = useHideScrollHint(
    !settling && subjectIndex > 0,
  );
  const header = (
    <View>
      {renderNode(HeaderComponent)}
      {isScrollHintVisible ? (
        <ScrollHint onPress={() => listRef.current?.scrollToTop()} />
      ) : null}
    </View>
  );

  return (
    <View style={Atoms.flex_1}>
      <List
        {...rest}
        ref={listRef}
        scrollY={scrollY}
        HeaderComponent={header}
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
      {!isWeb && settling ? (
        <View
          style={[Atoms.absolute, Atoms.inset_0, theme.atoms.box.primary.bg]}
        >
          {renderNode(HeaderComponent)}
          <Post post={post} hideReplyingTo={true} focusedView disablePress />
          <ComposerInput replyTo={post.id} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Shows a scroll hint once: from when `canShow` turns true until the first
 * scroll up, after which it stays hidden. Pass `scrollY` to the list.
 */
function useHideScrollHint(canShow: boolean) {
  const scrollY = useSharedValue(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const isScrollHintVisible = canShow && !isDismissed;

  useAnimatedReaction(
    () => scrollY.value,
    (offset, previousOffset) => {
      if (
        isScrollHintVisible &&
        previousOffset !== null &&
        offset < previousOffset
      ) {
        runOnJS(setIsDismissed)(true);
      }
    },
    [isScrollHintVisible],
  );

  return { scrollY, isScrollHintVisible };
}

function ScrollHint({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();

  return (
    <View
      pointerEvents="box-none"
      style={[
        Atoms.absolute,
        Atoms.items_center,
        Atoms.pt_sm,
        // Hangs below the header without changing its height.
        { top: '100%', left: 0, right: 0 },
      ]}
    >
      <View style={[theme.atoms.box.primary.bg, Atoms.rounded_full]}>
        <Button
          title=""
          icon="arrowUp"
          size="sm"
          variant="tertiary"
          onPress={onPress}
        />
      </View>
    </View>
  );
}

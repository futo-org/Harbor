import {
  measureElement,
  useWindowVirtualizer,
  type VirtualItem,
  type Virtualizer,
} from '@tanstack/react-virtual';
import { useIsFocused } from 'expo-router';
import type React from 'react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { Atoms } from '../../theme';
import { renderNode } from '../HidingHeader';
import type { ListProps, ListRef } from './types';

const ESTIMATED_ITEM_HEIGHT = 150;
// Call onEndReached once the last rendered row is within this many rows of
// the end, roughly two viewports like the native onEndReachedThreshold.
const END_REACHED_BUFFER = 12;

// A screen the router keeps mounted but hides reports every row as zero-high.
// Storing that collapses the list, so every row lands at the same offset and
// the text stacks on itself for a frame when the screen comes back. Hold the
// last real height instead, and let the next resize correct it.
function measureVisibleRow(
  element: Element,
  entry: ResizeObserverEntry | undefined,
  instance: Virtualizer<Window, Element>,
) {
  const size = measureElement(element, entry, instance);
  if (size > 0) return size;
  const key = instance.options.getItemKey(instance.indexFromElement(element));
  return instance.itemSizeCache.get(key) ?? ESTIMATED_ITEM_HEIGHT;
}

// The browser's popstate restoration applies stale offsets over ours.
if (typeof history !== 'undefined') {
  history.scrollRestoration = 'manual';
}

/** Scroll offset and row measurements of an unmounted list. Kept in
 *  `sessionStorage` to survive reloads. */
type SavedListState = { offset: number; measurements: VirtualItem[] };

const savedListStateKey = (key: string) => `harbor:list-scroll:${key}`;

function readSavedListState(key?: string): SavedListState | undefined {
  if (!key) return undefined;
  try {
    const raw = window.sessionStorage.getItem(savedListStateKey(key));
    return raw ? (JSON.parse(raw) as SavedListState) : undefined;
  } catch {
    return undefined;
  }
}

function writeSavedListState(key: string, state: SavedListState) {
  try {
    window.sessionStorage.setItem(
      savedListStateKey(key),
      JSON.stringify(state),
    );
  } catch {
    // Quota or privacy mode; scroll then starts at the top.
  }
}

export const List = forwardRef(function List<T>(
  props: ListProps<T>,
  ref: React.Ref<ListRef>,
) {
  return <WebList<T> {...props} listRef={ref} />;
}) as <T>(
  props: ListProps<T> & { ref?: React.Ref<ListRef> },
) => React.ReactElement;

function WebList<T>({
  data,
  renderItem,
  keyExtractor,
  HeaderComponent,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  onEndReached,
  onLoad,
  contentContainerStyle,
  listRef,
  restorationKey,
}: ListProps<T> & { listRef?: React.Ref<ListRef> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const items = (data as readonly T[] | null | undefined) ?? [];
  const isEmpty = items.length === 0;
  // The document is the scroll port on web, so virtualize against the window.
  // `scrollMargin` is the page offset of the rows, i.e. everything rendered
  // above them. The container only exists once the list has rows, so
  // remeasure when `isEmpty` flips.
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (isEmpty || !containerRef.current) return;
    setScrollMargin(
      containerRef.current.getBoundingClientRect().top + window.scrollY,
    );
  }, [isEmpty]);
  useImperativeHandle(
    listRef,
    () => ({
      scrollToTop: ({ animated = true } = {}) => {
        window.scrollTo({ top: 0, behavior: animated ? 'smooth' : 'auto' });
      },
    }),
    [],
  );

  // Keep parity with native `FlashList` by calling `onLoad`.
  const hasFiredOnLoad = useRef(false);
  useEffect(() => {
    if (hasFiredOnLoad.current) return;
    hasFiredOnLoad.current = true;
    onLoad?.({ elapsedTimeInMs: 0 });
  }, [onLoad]);

  // Read once on mount; unmount stores back under the same key.
  const restored = useRef(readSavedListState(restorationKey)).current;

  // Row heights vary, so each rendered row is measured via `measureElement`;
  // scrollMargin accounts for the headers rendered above the rows.
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 8,
    scrollMargin,
    initialOffset: restored?.offset,
    initialMeasurementsCache: restored?.measurements,
    // Rows measure during commit, where the default `flushSync` render costs a
    // list render per row and React warns. Measure outside commit instead.
    useFlushSync: false,
    useAnimationFrameWithResizeObserver: true,
    measureElement: measureVisibleRow,
    getItemKey: (index) =>
      typeof keyExtractor === 'function'
        ? keyExtractor(items[index], index)
        : index,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!restorationKey) return;
    const save = () =>
      writeSavedListState(restorationKey, {
        offset: virtualizer.scrollOffset ?? 0,
        measurements: virtualizer.measurementsCache,
      });
    // `pagehide` covers reloads and closes, where unmount never runs.
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [restorationKey, virtualizer]);

  // The saved offset can sit below the loaded rows, so retry as pages
  // land. The user scrolling cancels it.
  const pendingRestore = useRef(restored?.offset);
  useEffect(() => {
    if (pendingRestore.current === undefined) return;
    const cancel = () => {
      pendingRestore.current = undefined;
    };
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    return () => {
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: items.length retries the restore as pages land
  useLayoutEffect(() => {
    const offset = pendingRestore.current;
    if (isEmpty || offset === undefined) return;
    window.scrollTo(0, offset);
    if (window.scrollY >= offset - 1) pendingRestore.current = undefined;
  }, [isEmpty, items.length]);

  // Last scroll position while visible. By the time blur fires the window
  // has already clamped to the covering route's height.
  const focusedScrollY = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      if (containerRef.current?.offsetParent === null) return;
      focusedScrollY.current = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const blurredAt = useRef<number | undefined>(undefined);
  const isFocused = useIsFocused();
  const wasFocused = useRef(isFocused);
  useLayoutEffect(() => {
    if (isFocused === wasFocused.current) return;
    wasFocused.current = isFocused;
    if (!isFocused) {
      blurredAt.current = focusedScrollY.current;
      return;
    }
    const offset = blurredAt.current;
    blurredAt.current = undefined;
    if (offset === undefined) return;
    // A plain window scroll reaches the virtualizer a frame late.
    virtualizer.scrollToOffset(offset);
  }, [isFocused, virtualizer]);

  // The focus event lands a frame after the screen is shown, which would
  // paint one frame at the clamped offset. The container regaining its
  // size is the pre-paint signal.
  useEffect(() => {
    const el = containerRef.current;
    if (isEmpty || !el) return;
    const observer = new ResizeObserver(() => {
      const offset = blurredAt.current;
      if (offset === undefined || el.offsetParent === null) return;
      blurredAt.current = undefined;
      // Moves the window along with it; a plain scroll would reach the
      // virtualizer a frame late.
      virtualizer.scrollToOffset(offset);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isEmpty, virtualizer]);

  // Hold the rows from the last focused render while hidden, so the
  // restored frame paints exactly as it was left.
  const frozenItems = useRef<VirtualItem[] | null>(null);
  if (isFocused) {
    frozenItems.current = null;
  } else {
    frozenItems.current ??= virtualItems;
  }
  const rowsToRender = frozenItems.current ?? virtualItems;

  const lastRenderedIndex = virtualItems.length
    ? virtualItems[virtualItems.length - 1].index
    : -1;
  useEffect(() => {
    if (
      lastRenderedIndex >= 0 &&
      lastRenderedIndex >= items.length - 1 - END_REACHED_BUFFER
    ) {
      onEndReached?.();
    }
  }, [lastRenderedIndex, items.length, onEndReached]);

  return (
    <View style={[Atoms.flex_1, contentContainerStyle]}>
      {renderNode(HeaderComponent)}
      {renderNode(ListHeaderComponent)}
      {isEmpty ? (
        renderNode(ListEmptyComponent)
      ) : (
        <div
          ref={containerRef}
          style={{
            height: virtualizer.getTotalSize(),
            // RNW ancestors are column flex containers; without this the
            // spacer height gets flex-shrunk down to the viewport.
            flexShrink: 0,
            position: 'relative',
            width: '100%',
          }}
        >
          {rowsToRender.map((vItem) => (
            <div
              key={vItem.key}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${
                  vItem.start - virtualizer.options.scrollMargin
                }px)`,
              }}
            >
              {renderItem?.({
                item: items[vItem.index],
                index: vItem.index,
                target: 'Cell',
                extraData: undefined,
              }) ?? null}
            </div>
          ))}
        </div>
      )}
      {renderNode(ListFooterComponent)}
    </View>
  );
}

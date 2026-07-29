import { Sheet, SHEET_OVERLAY_PADDING } from '@/src/common/components/sheet';
import { TOPBAR_HEIGHT } from '@/src/common/components/layout/Topbar';
import {
  Atoms,
  Breakpoints,
  Spacing,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import {
  categories,
  computeSectionOffsets,
  DEFAULT_GRID_COLUMNS,
  EMOJI_FONT_SIZE,
  buildRows,
  type EmojiListItem,
} from './emojiData';
import { EdgeFade } from './EdgeFade';
import { EmojiGridRow } from './EmojiGridRow';
import { EmojiPickerCategoryTabs } from './EmojiPickerCategoryTabs';
import { EmojiSectionRule } from './EmojiSectionRule';

// How far beyond the viewport the `FlashList` will render. This is kept small
// because it seems smooth enough during scrolling, and we want good first-load
// performance.
const DRAW_DISTANCE = 100;
const COMPACT_MARGIN =
  2 * SHEET_OVERLAY_PADDING + TOPBAR_HEIGHT + 2 * Spacing.lg;
// Fade height for vertical fade, width for horizontal
const FADE_HEIGHT = 64;
const FADE_WIDTH = 48;
const GRID_HORIZONTAL_PADDING = Spacing.sm;
const LIST_MAX_HEIGHT = 420;
const TAB_BUTTON_SIZE = 44;
const TAB_RAIL_WIDTH = 56;
const TAB_BAR_PADDING = 2 * Spacing.xs + 1;

/**
 * Columns for the emoji grid. Native has fewer columns than web, to keep
 * emojis large enough to tap.
 */
function gridColumnsFor(width: number): number {
  if (isWeb) return DEFAULT_GRID_COLUMNS;
  return width < Breakpoints.sm ? 6 : 8;
}

type EmojiPickerFullProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  selectedEmoji?: string | null;
};

const keyExtractor = (item: EmojiListItem) => item.key;
const getItemType = (item: EmojiListItem) => item.type;

/**
 * Emoji picker sheet with a category rail and a scrollable grid, using
 * `FlashList` over a set of emojis in `emojiData`.
 */
export function EmojiPickerFull({
  open,
  onClose,
  onSelect,
  selectedEmoji,
}: EmojiPickerFullProps) {
  const { theme } = useTheme();
  const listRef = useRef<FlashListRef<EmojiListItem>>(null);
  const [activeSection, setActiveSection] = useState(categories[0]!.key);
  const [gridWidth, setGridWidth] = useState(0);
  const [measuredRowHeight, setMeasuredRowHeight] = useState(0);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(0);

  const { width, height: windowHeight } = useWindowDimensions();
  const borderColor = withHexOpacity(theme.palette.neutral_500, '20');

  const columns = useMemo(() => gridColumnsFor(width), [width]);
  const emojiRows = useMemo(() => buildRows(columns), [columns]);

  // The row height can be estimated using the size of the circular emoji buttons,
  // which depend on column width
  const estimatedRowHeight = useMemo(
    () =>
      gridWidth > 0 ? (gridWidth - 2 * GRID_HORIZONTAL_PADDING) / columns : 0,
    [gridWidth, columns],
  );
  const rowHeight = measuredRowHeight || estimatedRowHeight;

  // Native tabs match the grid's emoji buttons so the rail doesn't read as
  // cramped beside them. Falls back to the baseline until the grid measures.
  const tabSize = isWeb
    ? TAB_BUTTON_SIZE
    : Math.max(TAB_BUTTON_SIZE, Math.round(rowHeight));

  // Web/native layout parameters
  const layout = useMemo(() => {
    // Native: large emoji buttons, detent view, horizontal tabs, end fade.
    if (!isWeb) {
      const listHeight = LIST_MAX_HEIGHT - (tabSize + TAB_BAR_PADDING);
      return {
        contentFlexRow: false,
        tabContainerStyle: [
          Atoms.py_xs,
          { borderBottomWidth: 1, borderBottomColor: borderColor },
        ],
        tabHorizontal: true,
        tabFadeSize: FADE_WIDTH,
        listHeight,
        contentMaxHeight: LIST_MAX_HEIGHT,
      };
    }

    // Web: compact emoji buttons, modal view, vertical tabs, bottom fade.
    const isCompact = width < Breakpoints.sm;
    const listHeight = isCompact
      ? windowHeight - COMPACT_MARGIN
      : LIST_MAX_HEIGHT;
    return {
      contentFlexRow: true,
      tabContainerStyle: {
        width: TAB_RAIL_WIDTH,
        borderRightWidth: 1,
        borderRightColor: borderColor,
      },
      tabHorizontal: false,
      tabFadeSize: FADE_HEIGHT,
      listHeight,
      contentMaxHeight: isCompact
        ? listHeight + 2 * Spacing.lg
        : LIST_MAX_HEIGHT,
    };
  }, [borderColor, width, windowHeight, tabSize]);

  // Rather than scrolling by FlashList index, which will render items to get
  // the correct scroll offset, we compute the offset using the emoji data.
  // This makes section scrolling fast.
  const sectionOffsets = useMemo(
    () =>
      computeSectionOffsets(
        rowHeight,
        measuredHeaderHeight || undefined,
        columns,
      ),
    [rowHeight, measuredHeaderHeight, columns],
  );

  const onGridLayout = useCallback((e: LayoutChangeEvent) => {
    setGridWidth(e.nativeEvent.layout.width);
  }, []);

  const onRowLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setMeasuredRowHeight((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
  }, []);

  const onHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setMeasuredHeaderHeight((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
  }, []);

  // The section that the animated scroll is moving towards.
  const pendingSectionRef = useRef<string | null>(null);

  // Reset the active section for the tab bar when the picker opens.
  useEffect(() => {
    if (!open) return;
    pendingSectionRef.current = null;
    setActiveSection(categories[0]!.key);
  }, [open]);

  const scrollToSection = useCallback(
    (key: string) => {
      const offset = sectionOffsets[key];
      if (offset === undefined) return;
      pendingSectionRef.current = key;
      setActiveSection(key);
      listRef.current?.scrollToOffset({ offset, animated: true });
    },
    [sectionOffsets],
  );

  const onScrollBeginDrag = useCallback(() => {
    pendingSectionRef.current = null;
  }, []);

  // Set the active tab to be that of the previous section offset relative to
  // the viewport top.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Until a row has been measured, the scroll offsets will not be accurate.
      if (rowHeight <= 0) return;

      const y = e.nativeEvent.contentOffset.y;
      let active = categories[0]!.key;
      for (const c of categories) {
        if ((sectionOffsets[c.key] ?? 0) - 1 <= y) active = c.key;
        else break;
      }

      // Ignore intermediate sections while animating scroll
      if (pendingSectionRef.current) {
        if (pendingSectionRef.current !== active) return;
        pendingSectionRef.current = null;
      }
      setActiveSection((prev) => (prev === active ? prev : active));
    },
    [sectionOffsets, rowHeight],
  );

  const renderItem = useCallback(
    ({ item }: { item: EmojiListItem }) =>
      item.type === 'header' ? (
        <EmojiSectionRule
          onLayout={onHeaderLayout}
          collapsed={item.collapsed}
        />
      ) : (
        <EmojiGridRow
          emojis={item.emojis}
          onSelect={onSelect}
          selectedEmoji={selectedEmoji}
          color={theme.palette.neutral_1000}
          highlightColor={theme.palette.neutral_100}
          columns={columns}
          onLayout={onRowLayout}
        />
      ),
    [
      onSelect,
      selectedEmoji,
      theme.palette,
      columns,
      onRowLayout,
      onHeaderLayout,
    ],
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.5]}
      scrollable
      header={<Sheet.Header title="Pick a reaction" onClose={onClose} />}
    >
      <Sheet.Content
        style={[
          layout.contentFlexRow ? Atoms.flex_row : undefined,
          { maxHeight: layout.contentMaxHeight },
        ]}
      >
        <View style={layout.tabContainerStyle}>
          <EmojiPickerCategoryTabs
            categories={categories}
            activeKey={activeSection}
            onSelect={scrollToSection}
            tabSize={tabSize}
            endInset={layout.tabFadeSize}
            horizontal={layout.tabHorizontal}
            iconFontSize={isWeb ? undefined : EMOJI_FONT_SIZE}
          />
          <EdgeFade
            size={layout.tabFadeSize}
            direction={layout.tabHorizontal ? 'horizontal' : 'vertical'}
            id="emojiTabsFade"
          />
        </View>

        <View
          style={[Atoms.flex_1, { height: layout.listHeight }]}
          onLayout={onGridLayout}
        >
          <FlashList
            ref={listRef}
            data={emojiRows}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            onScroll={onScroll}
            onScrollBeginDrag={onScrollBeginDrag}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            drawDistance={DRAW_DISTANCE}
            contentContainerStyle={{
              ...Atoms.px_sm,
              paddingBottom: FADE_HEIGHT,
            }}
          />
          <EdgeFade size={FADE_HEIGHT} id="emojiGridFade" />
        </View>
      </Sheet.Content>
    </Sheet>
  );
}

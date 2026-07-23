import { Sheet, SHEET_OVERLAY_PADDING } from '@/src/common/components/sheet';
import { TOPBAR_HEIGHT } from '@/src/common/components/layout/Topbar';
import { Atoms, Breakpoints, Spacing, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import {
  categories,
  computeSectionOffsets,
  GRID_COLUMNS,
  EMOJI_ROWS,
  type EmojiListItem,
} from './emojiData';
import { BottomFade } from './BottomFade';
import { EmojiGridRow } from './EmojiGridRow';
import { EmojiPickerCategoryTabs } from './EmojiPickerCategoryTabs';
import { EmojiSectionRule } from './EmojiSectionRule';

// How far beyond the viewport the `FlashList` will render. This is kept small
// because it seems smooth enough during scrolling, and we want good first-load
// performance.
const DRAW_DISTANCE = 100;
const COMPACT_MARGIN =
  2 * SHEET_OVERLAY_PADDING + TOPBAR_HEIGHT + 2 * Spacing.lg;
const FADE_HEIGHT = 64;
const GRID_HORIZONTAL_PADDING = Spacing.sm;
const LIST_MAX_HEIGHT = 420;
const TAB_BUTTON_SIZE = 44;
const TAB_RAIL_WIDTH = 56;

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
  const compact = isWeb && width < Breakpoints.sm;
  const listHeight = compact ? windowHeight - COMPACT_MARGIN : LIST_MAX_HEIGHT;

  // The row height can be estimated using the size of the circular emoji buttons,
  // which depend on column width, which depends on row width.
  const estimatedRowHeight = useMemo(
    () =>
      gridWidth > 0
        ? (gridWidth - 2 * GRID_HORIZONTAL_PADDING) / GRID_COLUMNS
        : 0,
    [gridWidth],
  );

  // Rather than scrolling by FlashList index, which will render items to get
  // the correct scroll offset, we compute the offset using the emoji data.
  // This makes section scrolling fast.
  const sectionOffsets = useMemo(
    () =>
      computeSectionOffsets(
        // Prefer measured dimensions over estimated
        measuredRowHeight || estimatedRowHeight,
        measuredHeaderHeight || undefined,
      ),
    [measuredRowHeight, estimatedRowHeight, measuredHeaderHeight],
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

  const scrollToSection = useCallback(
    (key: string) => {
      const offset = sectionOffsets[key];
      if (offset === undefined) return;
      listRef.current?.scrollToOffset({ offset, animated: true });
    },
    [sectionOffsets],
  );

  // Set the active tab to be that of the previous section offset relative to
  // the viewport top.
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      let active = categories[0]!.key;
      for (const c of categories) {
        if ((sectionOffsets[c.key] ?? 0) - 1 <= y) active = c.key;
        else break;
      }
      setActiveSection((prev) => (prev === active ? prev : active));
    },
    [sectionOffsets],
  );

  const renderItem = useCallback(
    ({ item }: { item: EmojiListItem }) =>
      item.type === 'header' ? (
        <EmojiSectionRule onLayout={onHeaderLayout} />
      ) : (
        <EmojiGridRow
          emojis={item.emojis}
          onSelect={onSelect}
          selectedEmoji={selectedEmoji}
          color={theme.palette.neutral_1000}
          highlightColor={theme.palette.neutral_100}
          onLayout={onRowLayout}
        />
      ),
    [onSelect, selectedEmoji, theme.palette, onRowLayout, onHeaderLayout],
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
          Atoms.flex_row,
          {
            maxHeight: compact ? listHeight + 2 * Spacing.lg : LIST_MAX_HEIGHT,
          },
        ]}
      >
        <View style={{ width: TAB_RAIL_WIDTH }}>
          <View
            pointerEvents="none"
            style={[
              Atoms.absolute,
              {
                top: 0,
                bottom: 0,
                right: 0,
                width: 1,
                backgroundColor: theme.palette.neutral_200,
              },
            ]}
          />
          <EmojiPickerCategoryTabs
            categories={categories}
            activeKey={activeSection}
            onSelect={scrollToSection}
            tabSize={TAB_BUTTON_SIZE}
            bottomInset={FADE_HEIGHT}
          />
          <BottomFade height={FADE_HEIGHT} id="emojiTabsFade" />
        </View>

        <View
          style={[Atoms.flex_1, { height: listHeight }]}
          onLayout={onGridLayout}
        >
          <FlashList
            ref={listRef}
            data={EMOJI_ROWS}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            drawDistance={DRAW_DISTANCE}
            contentContainerStyle={{
              ...Atoms.px_sm,
              paddingBottom: FADE_HEIGHT,
            }}
          />
          <BottomFade height={FADE_HEIGHT} id="emojiGridFade" />
        </View>
      </Sheet.Content>
    </Sheet>
  );
}

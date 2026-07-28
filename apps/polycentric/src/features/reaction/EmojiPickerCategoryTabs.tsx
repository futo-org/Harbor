import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { ScrollView } from 'react-native';
import type { EmojiCategory } from './emojiData';
import { Emoji } from './Emoji';

type EmojiPickerCategoryTabsProps = {
  categories: EmojiCategory[];
  activeKey: string;
  onSelect: (key: string) => void;
  tabSize: number;
  /** Lay the tabs horizontally on native, and vertically on web */
  horizontal?: boolean;
  /** Trailing padding so the last tab can scroll clear of the fade overlay. */
  endInset?: number;
  iconFontSize?: number;
};

export function EmojiPickerCategoryTabs({
  categories,
  activeKey,
  onSelect,
  tabSize,
  horizontal = false,
  endInset = 0,
  iconFontSize,
}: EmojiPickerCategoryTabsProps) {
  const { theme } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const viewportExtent = useRef(0);
  const scrollOffset = useRef(0);
  const activeIndex = categories.findIndex((c) => c.key === activeKey);

  // Keep the active tab visible as the grid scrolls
  useEffect(() => {
    if (activeIndex < 0) return;
    const extent = viewportExtent.current;
    if (extent <= 0) return;

    const stride = tabSize + Spacing.xs;
    const start = Spacing.xs + activeIndex * stride;
    const end = start + tabSize;
    const offset = scrollOffset.current;

    // Scroll forward/backward to bring the tab into view, clear of the fade
    if (start < offset) {
      const target = Math.max(0, start - Spacing.xs);
      scrollRef.current?.scrollTo(
        horizontal
          ? { x: target, animated: true }
          : { y: target, animated: true },
      );
    } else if (end > offset + extent - endInset) {
      const target = end - extent + endInset;
      scrollRef.current?.scrollTo(
        horizontal
          ? { x: target, animated: true }
          : { y: target, animated: true },
      );
    }
  }, [activeIndex, tabSize, horizontal, endInset]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { x, y } = e.nativeEvent.contentOffset;
    scrollOffset.current = horizontal ? x : y;
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal={horizontal}
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onScroll}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        viewportExtent.current = horizontal ? width : height;
      }}
      contentContainerStyle={[
        Atoms.gap_xs,
        Atoms.align_center,
        horizontal ? Atoms.px_xs : Atoms.py_xs,
        horizontal ? { paddingRight: endInset } : { paddingBottom: endInset },
      ]}
    >
      {categories.map((cat) => {
        const active = cat.key === activeKey;
        return (
          <Emoji
            key={cat.key}
            emoji={cat.icon}
            onSelect={onSelect}
            value={cat.key}
            size={tabSize}
            selected={active}
            color={theme.palette.neutral_1000}
            highlightColor={theme.palette.neutral_100}
            style={iconFontSize ? { fontSize: iconFontSize } : undefined}
          />
        );
      })}
    </ScrollView>
  );
}

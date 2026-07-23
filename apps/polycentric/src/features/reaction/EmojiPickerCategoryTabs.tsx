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
  /** Bottom padding so the last tab clears the bottom fade. */
  bottomInset?: number;
};

export function EmojiPickerCategoryTabs({
  categories,
  activeKey,
  onSelect,
  tabSize,
  bottomInset = 0,
}: EmojiPickerCategoryTabsProps) {
  const { theme } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const viewportHeight = useRef(0);
  const scrollY = useRef(0);
  const activeIndex = categories.findIndex((c) => c.key === activeKey);

  // Keep the active tab visible as the grid scrolls. Note that `bottomInset` reserves space
  // for the fade.
  useEffect(() => {
    if (activeIndex < 0) return;
    const vh = viewportHeight.current;
    if (vh <= 0) return;

    const stride = tabSize + Spacing.xs; // tab height + gap_xs
    const top = Spacing.xs + activeIndex * stride; // py_xs top padding
    const bottom = top + tabSize;
    const y = scrollY.current;

    if (top < y) {
      scrollRef.current?.scrollTo({
        y: Math.max(0, top - Spacing.xs),
        animated: true,
      });
    } else if (bottom > y + vh - bottomInset) {
      scrollRef.current?.scrollTo({
        y: bottom - vh + bottomInset,
        animated: true,
      });
    }
  }, [activeIndex, tabSize, bottomInset]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={onScroll}
      onLayout={(e) => {
        viewportHeight.current = e.nativeEvent.layout.height;
      }}
      contentContainerStyle={[
        Atoms.gap_xs,
        Atoms.py_xs,
        Atoms.align_center,
        { paddingBottom: bottomInset },
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
          />
        );
      })}
    </ScrollView>
  );
}

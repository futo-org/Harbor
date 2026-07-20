import { Sheet } from '@/src/common/components/sheet';
import { Atoms, Spacing } from '@/src/common/theme';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import type { ViewToken } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { buildEmojiItems, categories } from './emojiData';
import type { PickerItem } from './emojiData';
import { EmojiGridRow } from './EmojiGridRow';
import { EmojiPickerCategoryTabs } from './EmojiPickerCategoryTabs';
import { EmojiSectionRule } from './EmojiSectionRule';

const GRID_BUTTON_SIZE = 36;
const TAB_BUTTON_SIZE = 44;
const TAB_RAIL_WIDTH = 56;
const LIST_MAX_HEIGHT = 420;

type EmojiPickerFullProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  selectedEmoji?: string | null;
};

export function EmojiPickerFull({
  open,
  onClose,
  onSelect,
  selectedEmoji,
}: EmojiPickerFullProps) {
  const [panelWidth, setPanelWidth] = useState(0);
  const [activeSection, setActiveSection] = useState(categories[0]!.key);
  const listRef = useRef<FlashListRef<PickerItem>>(null);

  const columns = useMemo(() => {
    if (panelWidth <= 0) return 1;
    return Math.max(
      1,
      Math.floor(
        (panelWidth + Spacing['2xs']) / (GRID_BUTTON_SIZE + Spacing['2xs']),
      ),
    );
  }, [panelWidth]);

  const { items, sectionOffset } = useMemo(
    () => buildEmojiItems(categories, columns),
    [columns],
  );

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose],
  );

  const renderItem = useCallback(
    ({ item }: { item: PickerItem }) => {
      if (item.type === 'header') {
        return <EmojiSectionRule first={item.first} />;
      }
      return (
        <EmojiGridRow
          emojis={item.emojis}
          onSelect={handleSelect}
          selectedEmoji={selectedEmoji}
          buttonSize={GRID_BUTTON_SIZE}
        />
      );
    },
    [handleSelect, selectedEmoji],
  );

  const scrollToSection = useCallback(
    (key: string) => {
      const offset = sectionOffset[key];
      if (offset === undefined) return;
      listRef.current?.scrollToOffset({ offset, animated: true });
    },
    [sectionOffset],
  );

  // Stable viewability callback — ref ensures FlashList doesn't re-create layout.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      for (const v of viewableItems) {
        const item = v.item as PickerItem | undefined;
        if (item?.type === 'header') {
          setActiveSection(item.categoryKey);
          break;
        }
      }
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      setPanelWidth(e.nativeEvent.layout.width);
    },
    [],
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
        style={[{ maxHeight: LIST_MAX_HEIGHT, flexDirection: 'row' }]}
      >
        <View
          style={{
            width: TAB_RAIL_WIDTH,
            borderRightWidth: 1,
            borderRightColor: '#e0e0e0',
          }}
        >
          <EmojiPickerCategoryTabs
            categories={categories}
            activeKey={activeSection}
            onSelect={scrollToSection}
            tabSize={TAB_BUTTON_SIZE}
          />
        </View>
        <View
          style={[
            Atoms.flex_1,
            Atoms.pt_sm,
            { paddingHorizontal: Spacing.sm, height: LIST_MAX_HEIGHT },
          ]}
          onLayout={onLayout}
        >
          {panelWidth > 0 ? (
            <FlashList
              key={columns}
              ref={listRef}
              data={items}
              keyExtractor={(_item, index) => String(index)}
              renderItem={renderItem}
              getItemType={(item) => item.type}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[Atoms.py_xs]}
            />
          ) : null}
        </View>
      </Sheet.Content>
    </Sheet>
  );
}

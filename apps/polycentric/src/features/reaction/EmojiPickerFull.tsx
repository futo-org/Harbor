import { Sheet } from '@/src/common/components/sheet';
import { Atoms } from '@/src/common/theme';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { categories, type EmojiEntry } from './emojiData';
import { EmojiPickerCategoryTabs } from './EmojiPickerCategoryTabs';
import { EmojiGridRow } from './EmojiGridRow';

const EMOJIS_PER_ROW = 8;

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
  const [activeCategory, setActiveCategory] = useState(categories[0]!.key);

  const activeEmojis = useMemo(() => {
    const cat = categories.find((c) => c.key === activeCategory);
    return cat?.emojis ?? [];
  }, [activeCategory]);

  const rows = useMemo(() => {
    const result: EmojiEntry[][] = [];
    for (let i = 0; i < activeEmojis.length; i += EMOJIS_PER_ROW) {
      result.push(activeEmojis.slice(i, i + EMOJIS_PER_ROW));
    }
    return result;
  }, [activeEmojis]);

  const handleSelect = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      onClose();
    },
    [onSelect, onClose],
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      detents={[0.5]}
      header={<Sheet.Header title="Pick a reaction" onClose={onClose} />}
    >
      <Sheet.Content style={[Atoms.px_lg, { maxHeight: 420, minHeight: 0 }]}>
        <EmojiPickerCategoryTabs
          categories={categories}
          activeKey={activeCategory}
          onSelect={setActiveCategory}
        />
        <View style={[Atoms.pt_sm, Atoms.flex_1, { minHeight: 0 }]}>
          <FlatList
            data={rows}
            keyExtractor={(_, index) => String(index)}
            renderItem={({ item }) => (
              <EmojiGridRow
                emojis={item}
                onSelect={handleSelect}
                selectedEmoji={selectedEmoji}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[Atoms.py_xs]}
          />
        </View>
      </Sheet.Content>
    </Sheet>
  );
}

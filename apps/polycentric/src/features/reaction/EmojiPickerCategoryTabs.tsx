import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import { Pressable, ScrollView } from 'react-native';
import type { EmojiCategory } from './emojiData';
import { Emoji } from './Emoji';

type EmojiPickerCategoryTabsProps = {
  categories: EmojiCategory[];
  activeKey: string;
  onSelect: (key: string) => void;
  tabSize: number;
};

export function EmojiPickerCategoryTabs({
  categories,
  activeKey,
  onSelect,
  tabSize,
}: EmojiPickerCategoryTabsProps) {
  const { theme } = useTheme();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[Atoms.gap_xs, Atoms.py_xs]}
    >
      {categories.map((cat) => {
        const active = cat.key === activeKey;
        return (
          <Pressable
            key={cat.key}
            onPress={() => onSelect(cat.key)}
            style={[
              Atoms.align_center,
              Atoms.justify_center,
              {
                width: tabSize,
                height: tabSize,
                borderRadius: BorderRadius.full,
                backgroundColor: active
                  ? theme.palette.primary_500
                  : 'transparent',
              },
            ]}
          >
            <Emoji
              emoji={cat.icon}
              onPress={() => onSelect(cat.key)}
              size={tabSize}
              selected={active}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

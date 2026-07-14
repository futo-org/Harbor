import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import { Pressable, ScrollView, Text } from 'react-native';
import type { EmojiCategory } from './emojiData';

type EmojiPickerCategoryTabsProps = {
  categories: EmojiCategory[];
  activeKey: string;
  onSelect: (key: string) => void;
};

export function EmojiPickerCategoryTabs({
  categories,
  activeKey,
  onSelect,
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
                width: 40,
                height: 40,
                borderRadius: BorderRadius.full,
                backgroundColor: active
                  ? theme.palette.primary_500
                  : 'transparent',
              },
            ]}
          >
            <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

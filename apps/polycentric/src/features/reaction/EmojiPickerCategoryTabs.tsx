import { HorizontalScrollGroup } from '@/src/common/components/primitives/HorizontalScrollGroup';
import { Atoms, BorderRadius, Spacing, useTheme } from '@/src/common/theme';
import { Pressable, Text, View } from 'react-native';
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
    <HorizontalScrollGroup>
      {categories.map((cat) => {
        const active = cat.key === activeKey;
        return (
          <Pressable
            key={cat.key}
            onPress={() => onSelect(cat.key)}
            style={[
              Atoms.flex_row,
              Atoms.align_center,
              {
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.xs,
                borderRadius: BorderRadius.full,
                backgroundColor: active
                  ? theme.palette.primary_500
                  : theme.palette.neutral_25,
              },
            ]}
          >
            <Text style={{ fontSize: 16, marginRight: Spacing.xs }}>
              {cat.icon}
            </Text>
            <Text
              style={[
                Atoms.text_sm,
                {
                  color: active
                    ? theme.palette.neutral_0
                    : theme.palette.neutral_900,
                },
              ]}
              numberOfLines={1}
            >
              {cat.name}
            </Text>
          </Pressable>
        );
      })}
    </HorizontalScrollGroup>
  );
}

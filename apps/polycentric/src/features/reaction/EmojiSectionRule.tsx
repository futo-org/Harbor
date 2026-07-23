import React from 'react';
import { useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SECTION_RULE_PADDING } from './emojiData';

/** Horizontal rule between emoji categories. */
export const EmojiSectionRule = React.memo(function EmojiSectionRule({
  onLayout,
}: {
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { theme } = useTheme();

  return (
    <View style={{ paddingVertical: SECTION_RULE_PADDING }} onLayout={onLayout}>
      <View style={{ height: 1, backgroundColor: theme.palette.neutral_200 }} />
    </View>
  );
});

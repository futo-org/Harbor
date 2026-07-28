import React from 'react';
import { useTheme, withHexOpacity } from '@/src/common/theme';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SECTION_RULE_PADDING } from './emojiData';

type EmojiSectionRuleProps = {
  onLayout?: (e: LayoutChangeEvent) => void;
  hidden?: boolean;
};

/** Horizontal rule between emoji categories. */
export const EmojiSectionRule = React.memo(function EmojiSectionRule({
  onLayout,
  hidden = false,
}: EmojiSectionRuleProps) {
  const { theme } = useTheme();

  return (
    <View style={{ paddingVertical: SECTION_RULE_PADDING }} onLayout={onLayout}>
      <View
        style={{
          height: 1,
          backgroundColor: hidden
            ? 'transparent'
            : withHexOpacity(theme.palette.neutral_500, '20'),
        }}
      />
    </View>
  );
});

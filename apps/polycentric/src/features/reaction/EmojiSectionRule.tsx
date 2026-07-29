import React from 'react';
import { useTheme, withHexOpacity } from '@/src/common/theme';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { SECTION_RULE_PADDING } from './emojiData';

type EmojiSectionRuleProps = {
  onLayout?: (e: LayoutChangeEvent) => void;
  /** Hide/collapse the first section rule. */
  collapsed?: boolean;
};

/** Horizontal rule between emoji categories. */
export const EmojiSectionRule = React.memo(function EmojiSectionRule({
  onLayout,
  collapsed = false,
}: EmojiSectionRuleProps) {
  const { theme } = useTheme();
  if (collapsed) return <View style={{ height: 0 }} />;
  return (
    <View style={{ paddingVertical: SECTION_RULE_PADDING }} onLayout={onLayout}>
      <View
        style={{
          height: 1,
          backgroundColor: withHexOpacity(theme.palette.neutral_500, '20'),
        }}
      />
    </View>
  );
});

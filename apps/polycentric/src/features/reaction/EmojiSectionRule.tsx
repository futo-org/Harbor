import React from 'react';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { View } from 'react-native';

type EmojiSectionRuleProps = {
  /** Whether this is the first section. If so, do not render a rule above. */
  first: boolean;
};

/**
 * A full-width horizontal rule between emoji categories.
 * The very first section gets only a small top spacer, no rule.
 */
export const EmojiSectionRule = React.memo(function EmojiSectionRule({
  first,
}: EmojiSectionRuleProps) {
  const { theme } = useTheme();

  if (first) {
    return <View style={[Atoms.pt_sm]} />;
  }

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: theme.palette.neutral_200,
        marginVertical: Spacing.xs,
      }}
    />
  );
});

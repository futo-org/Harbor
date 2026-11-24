import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import HoverCard from './HoverCard';
import { Text } from './primitives/Text';

/**
 * Wraps a trigger with a text bubble above it. Opens on hover (web) and on
 * tap (native, where a tap anywhere closes it).
 */
export function Tooltip({
  text,
  children,
  containerStyle,
}: {
  text: string;
  children: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();

  return (
    <HoverCard openDelay={0}>
      <HoverCard.Trigger accessibilityLabel={text} style={containerStyle}>
        {children}
      </HoverCard.Trigger>
      <HoverCard.Content
        align="start"
        side="top"
        sideOffset={Spacing.xs}
        insets={insets}
      >
        <View
          style={[
            Atoms.pt_sm,
            Atoms.pb_sm,
            Atoms.pl_md,
            Atoms.pr_md,
            Atoms.rounded_md,
            theme.atoms.box.secondary.bg,
            theme.atoms.box.secondary.border,
            Atoms.border,
            { maxWidth: 260 },
          ]}
        >
          <Text variant="small" color="secondary" fontWeight="semibold">
            {text}
          </Text>
        </View>
      </HoverCard.Content>
    </HoverCard>
  );
}

const insets = {
  top: Spacing.sm,
  bottom: Spacing.sm,
  left: Spacing.sm,
  right: Spacing.sm,
};

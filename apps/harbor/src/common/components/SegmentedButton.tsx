import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon, { type IconName } from './Icon';
import { Text } from './primitives';
import { isWeb } from '@/src/common/util/platform';

type SegmentData = {
  label: string;
  active?: boolean;
  icon?: IconName;
  onPress?: () => void;
};

type SegmentedButtonProps = {
  segments: SegmentData[];
} & ComponentProps<typeof View>;

/**
 * A rounded track holding button segments that function like radio buttons.
 * The active button is highlighted and a hairline border separates segments.
 */
export function SegmentedButton({
  segments,
  style,
  ...props
}: SegmentedButtonProps) {
  const { theme } = useTheme();

  return (
    <View style={[Atoms.flex_row, Atoms.align_center, style]} {...props}>
      {segments.map(({ label, active, icon, onPress }, index) => (
        <Segment
          key={label}
          label={label}
          isFirst={index === 0}
          isLast={index === segments.length - 1}
          active={active}
          icon={icon}
          onPress={onPress}
        />
      ))}
    </View>
  );
}

/**
 * A single pressable segment within a `SegmentedButton`.
 */
function Segment({
  label,
  isFirst,
  isLast,
  active = false,
  icon,
  onPress,
}: {
  label: string;
  isFirst: boolean;
  isLast: boolean;
  active?: boolean;
  icon?: IconName;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const { hovered, onHoverIn, onHoverOut } = useWebHover();

  const foreground = active ? 'white' : 'neutral_500';

  const leftRounded = isFirst
    ? {
        borderTopLeftRadius: BorderRadius.full,
        borderBottomLeftRadius: BorderRadius.full,
      }
    : undefined;

  const rightRounded = isLast
    ? {
        borderTopRightRadius: BorderRadius.full,
        borderBottomRightRadius: BorderRadius.full,
      }
    : undefined;

  const activeBorder = active
    ? {
        borderTopColor: theme.palette.primary_600,
        borderBottomColor: theme.palette.primary_600,
        borderLeftColor: isFirst ? theme.palette.primary_600 : undefined,
        borderRightColor: isLast ? theme.palette.primary_600 : undefined,
      }
    : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.justify_center,
        Atoms.p_sm,
        {
          borderWidth: StyleSheet.hairlineWidth,
          borderRightWidth: isLast ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.palette.neutral_50,
          backgroundColor: active
            ? theme.palette.primary_500
            : hovered
              ? theme.palette.neutral_50
              : theme.palette.neutral_25,
        },
        leftRounded,
        rightRounded,
        activeBorder,
      ]}
    >
      {icon && <Icon name={icon} size={12} color={foreground} />}
      <Text
        variant="small"
        fontWeight="semibold"
        color={foreground}
        selectable={false}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

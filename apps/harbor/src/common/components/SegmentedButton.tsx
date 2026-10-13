import { useWebHover } from '@/src/common/lib/useWebHover';
import { Atoms, BorderRadius, useTheme } from '@/src/common/theme';
import { type ComponentProps, Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Icon, { type IconName } from './Icon';
import { Text } from './primitives';

type SegmentData = {
  label: string;
  active?: boolean;
  icon?: IconName;
  onPress?: () => void;
};

type SegmentedButtonProps = {
  segments: SegmentData[];
} & ComponentProps<typeof View>;

const LEFT_ROUNDED = {
  borderTopLeftRadius: BorderRadius.full,
  borderBottomLeftRadius: BorderRadius.full,
};

const RIGHT_ROUNDED = {
  borderTopRightRadius: BorderRadius.full,
  borderBottomRightRadius: BorderRadius.full,
};

/**
 * A row of button segments that function like radio buttons.
 * The active segment is filled; inactive ones are outlined with a hairline
 * border, shared between neighbors.
 */
export function SegmentedButton({
  segments,
  style,
  ...props
}: SegmentedButtonProps) {
  const { theme } = useTheme();

  return (
    <View style={[Atoms.flex_row, style]} {...props}>
      {segments.map(({ label, active, icon, onPress }, index) => (
        <Fragment key={label}>
          {index > 0 && (
            <View
              style={[
                Atoms.self_stretch,
                {
                  width: StyleSheet.hairlineWidth,
                  // Next to the active segment, the separator joins its fill.
                  backgroundColor:
                    active || segments[index - 1].active
                      ? theme.palette.primary_500
                      : theme.palette.neutral_50,
                },
              ]}
            />
          )}
          <Segment
            label={label}
            isFirst={index === 0}
            isLast={index === segments.length - 1}
            active={active}
            icon={icon}
            onPress={onPress}
          />
        </Fragment>
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      // The border is the outer background showing through the padding: iOS
      // smears RN borders that mix per-side widths with rounded corners.
      style={[
        {
          paddingVertical: StyleSheet.hairlineWidth,
          backgroundColor: active
            ? theme.palette.primary_500
            : theme.palette.neutral_50,
        },
        isFirst && { paddingLeft: StyleSheet.hairlineWidth },
        isLast && { paddingRight: StyleSheet.hairlineWidth },
        isFirst && LEFT_ROUNDED,
        isLast && RIGHT_ROUNDED,
      ]}
    >
      <View
        style={[
          Atoms.flex_1,
          Atoms.flex_row,
          Atoms.align_center,
          Atoms.justify_center,
          Atoms.gap_xs,
          Atoms.p_sm,
          !active && {
            backgroundColor: hovered
              ? theme.palette.neutral_50
              : theme.palette.neutral_25,
          },
          isFirst && LEFT_ROUNDED,
          isLast && RIGHT_ROUNDED,
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
      </View>
    </Pressable>
  );
}

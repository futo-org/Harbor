import { Atoms, type TextColor } from '@/src/common/theme';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';
import Icon, { type IconName, IconsMap } from './Icon';
import { Text } from './primitives/Text';

const ICON_CELL_WIDTH = 96;

const TEXT_COLORS: TextColor[] = [
  'primary',
  'secondary',
  'muted',
  'accent',
  'danger',
  'success',
  'warning',
  'light',
  'dark',
];

const meta = {
  title: 'Icon',
  args: { size: 24, color: 'primary', showBounds: false },
  argTypes: {
    size: { control: { type: 'range', min: 8, max: 64, step: 1 } },
    color: { control: 'select', options: TEXT_COLORS },
    showBounds: { control: 'boolean' },
  },
  render: ({ size, color, showBounds }) => (
    <View style={[Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_md, Atoms.p_lg]}>
      {(Object.keys(IconsMap) as IconName[]).map((name) => (
        <View
          key={name}
          style={[Atoms.items_center, Atoms.gap_xs, { width: ICON_CELL_WIDTH }]}
        >
          <View
            style={
              showBounds && {
                outlineWidth: 1,
                outlineStyle: 'solid',
                outlineColor: 'red',
              }
            }
          >
            <Icon name={name} size={size} color={color} />
          </View>
          <Text variant="small" color="muted" numberOfLines={1}>
            {name}
          </Text>
        </View>
      ))}
    </View>
  ),
} satisfies Meta<{ size: number; color: TextColor; showBounds: boolean }>;

export default meta;

export const AllIcons: StoryObj<typeof meta> = {};

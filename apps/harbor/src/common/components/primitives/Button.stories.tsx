import { Atoms } from '@/src/common/theme';
import type { Meta, StoryObj } from '@storybook/react-native';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { IconsMap } from '../Icon';
import { Button } from './Button';
import { Text } from './Text';

type ButtonProps = ComponentProps<typeof Button>;

const VARIANTS: NonNullable<ButtonProps['variant']>[] = [
  'primary',
  'secondary',
  'tertiary',
  'destructive',
];
const SIZES: NonNullable<ButtonProps['size']>[] = ['sm', 'md', 'lg'];

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: {
    title: 'Button',
    variant: 'primary',
    size: 'md',
    disabled: false,
    fullWidth: false,
  },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    size: { control: 'select', options: SIZES },
    icon: { control: 'select', options: Object.keys(IconsMap) },
    onPress: { action: 'onPress' },
  },
  decorators: [
    (Story) => (
      <View style={Atoms.p_lg}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllVariants: Story = {
  render: (args) => (
    <View style={Atoms.gap_xl}>
      {VARIANTS.map((variant) => (
        <View key={variant} style={Atoms.gap_sm}>
          <Text variant="small" color="muted">
            {variant}
          </Text>
          <View
            style={[
              Atoms.flex_row,
              Atoms.flex_wrap,
              Atoms.items_center,
              Atoms.gap_md,
            ]}
          >
            {SIZES.map((size) => (
              <Button
                key={size}
                {...args}
                title={size}
                variant={variant}
                size={size}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  ),
};

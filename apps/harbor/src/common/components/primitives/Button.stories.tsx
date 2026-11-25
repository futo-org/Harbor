import { Atoms, useTheme } from '@/src/common/theme';
import type { Meta, StoryObj } from '@storybook/react-native';
import type { ComponentProps, PropsWithChildren } from 'react';
import { View } from 'react-native';
import { type IconName, IconsMap } from '../Icon';
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

// Width of the containers the Overflow story squeezes buttons into
const NARROW_CONTAINER_WIDTH = 200;

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
  // The grid sets these on every button
  argTypes: {
    title: { control: false },
    variant: { control: false },
    size: { control: false },
  },
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

export const Overflow: Story = {
  args: {
    title: 'A button title far too long for its container',
  },
  argTypes: {
    // Each case sets it
    fullWidth: { control: false },
  },
  render: (args) => (
    <View style={Atoms.gap_xl}>
      <NarrowContainer label="No icon">
        <Button {...args} icon={undefined} />
      </NarrowContainer>
      <NarrowContainer label="With icon">
        <Button {...args} icon={args.icon ?? 'add'} />
      </NarrowContainer>
      <NarrowContainer label="No icon, full width">
        <Button {...args} icon={undefined} fullWidth />
      </NarrowContainer>
      <NarrowContainer label="With icon, full width">
        <Button {...args} icon={args.icon ?? 'add'} fullWidth />
      </NarrowContainer>
    </View>
  ),
};

export const IconHeights: Story = {
  argTypes: {
    // Each button sets its own
    title: { control: false },
    icon: { control: false },
  },
  render: (args) => (
    <OutlinedRow>
      {/* An Ionicons glyph's line box is ~1.1x the icon size, taller than the
          label at md and lg; other icon sets match the icon size */}
      {([undefined, 'personAdd', 'add'] as const).map(
        (icon: IconName | undefined) => (
          <Button
            key={icon ?? 'none'}
            {...args}
            title={icon ?? 'no icon'}
            icon={icon}
          />
        ),
      )}
      {/* Icon only: an empty title */}
      <Button {...args} title="" icon="personAdd" />
      <Button {...args} title="" icon="add" />
    </OutlinedRow>
  ),
};

function NarrowContainer({
  label,
  children,
}: PropsWithChildren<{ label: string }>) {
  const { theme } = useTheme();

  return (
    <View style={Atoms.gap_sm}>
      <Text variant="small" color="muted">
        {label}
      </Text>
      <View
        style={[
          Atoms.py_md,
          Atoms.border,
          theme.atoms.outline,
          { width: NARROW_CONTAINER_WIDTH },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function OutlinedRow({ children }: PropsWithChildren) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.flex_wrap,
        // So a button taller than its neighbours stands out
        Atoms.items_start,
        Atoms.gap_md,
        Atoms.px_md,
        Atoms.border,
        theme.atoms.outline,
      ]}
    >
      {children}
    </View>
  );
}

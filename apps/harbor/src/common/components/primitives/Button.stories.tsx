import { Atoms, createThemedStyles } from '@/src/common/theme';
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
const SIZE_TITLES: Record<(typeof SIZES)[number], string> = {
  sm: 'Small',
  md: 'Medium',
  lg: 'Large',
};

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
    (Story) => {
      const styles = useStyles();
      return (
        <View style={styles.story}>
          <Story />
        </View>
      );
    },
  ],
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllVariants: Story = {
  parameters: {
    controls: { include: ['icon', 'disabled', 'onPress'] },
  },
  render: (args) => {
    const styles = useStyles();
    return (
      <View style={styles.sections}>
        {VARIANTS.map((variant) => (
          <View key={variant} style={styles.labelled}>
            <Text variant="small" color="muted">
              {variant}
            </Text>
            <View style={styles.sizeRow}>
              {SIZES.map((size) => (
                <Button
                  key={size}
                  {...args}
                  title={SIZE_TITLES[size]}
                  variant={variant}
                  size={size}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  },
};

export const Overflow: Story = {
  args: {
    title: 'A title too long for the box',
  },
  parameters: {
    controls: {
      include: ['title', 'variant', 'size', 'icon', 'disabled', 'onPress'],
    },
  },
  render: (args) => {
    const styles = useStyles();
    return (
      <View style={styles.sections}>
        <View style={styles.containerRow}>
          <NarrowContainer label="Short, no icon">
            <Button {...args} title="Short" icon={undefined} />
          </NarrowContainer>
          <NarrowContainer label="Short, with icon">
            <Button {...args} title="Short" icon={args.icon ?? 'add'} />
          </NarrowContainer>
          <NarrowContainer label="Short, no icon, full width">
            <Button {...args} title="Short" icon={undefined} fullWidth />
          </NarrowContainer>
          <NarrowContainer label="Short, with icon, full width">
            <Button
              {...args}
              title="Short"
              icon={args.icon ?? 'add'}
              fullWidth
            />
          </NarrowContainer>
        </View>
        <View style={styles.containerRow}>
          <NarrowContainer label="Long, no icon">
            <Button {...args} icon={undefined} />
          </NarrowContainer>
          <NarrowContainer label="Long, with icon">
            <Button {...args} icon={args.icon ?? 'add'} />
          </NarrowContainer>
          <NarrowContainer label="Long, no icon, full width">
            <Button {...args} icon={undefined} fullWidth />
          </NarrowContainer>
          <NarrowContainer label="Long, with icon, full width">
            <Button {...args} icon={args.icon ?? 'add'} fullWidth />
          </NarrowContainer>
        </View>
      </View>
    );
  },
};

export const IconHeights: Story = {
  parameters: {
    controls: { include: ['variant', 'size', 'disabled', 'onPress'] },
  },
  render: (args) => {
    const styles = useStyles();
    return (
      <View style={styles.outlinedRow}>
        {/* Icons of different heights; the button heights must all match */}
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
        <Button {...args} title="" icon="personAdd" />
        <Button {...args} title="" icon="add" />
      </View>
    );
  },
};

function NarrowContainer({
  label,
  children,
}: PropsWithChildren<{ label: string }>) {
  const styles = useStyles();

  return (
    <View style={styles.labelled}>
      <Text variant="small" color="muted">
        {label}
      </Text>
      <View style={styles.narrowContainer}>{children}</View>
    </View>
  );
}

const useStyles = createThemedStyles((theme, define) =>
  define({
    story: Atoms.p_lg,
    sections: Atoms.gap_xl,
    labelled: Atoms.gap_sm,
    sizeRow: [
      Atoms.flex_row,
      Atoms.flex_wrap,
      Atoms.items_center,
      Atoms.gap_md,
    ],
    containerRow: [Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_xl],
    narrowContainer: [
      Atoms.py_md,
      Atoms.border,
      theme.atoms.outline,
      { width: NARROW_CONTAINER_WIDTH },
    ],
    outlinedRow: [
      Atoms.flex_row,
      Atoms.flex_wrap,
      Atoms.items_start,
      Atoms.gap_md,
      Atoms.px_md,
      Atoms.border,
      theme.atoms.outline,
    ],
  }),
);

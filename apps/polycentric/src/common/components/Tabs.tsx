import { Atoms, useTheme } from '@/src/common/theme';
import type { ComponentProps, ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './primitives';

type TabsProps = {
  children: (ReactElement<TabProps> | boolean)[] | ReactElement<TabProps>;
} & ComponentProps<typeof View>;

// A full-width bar of equal-width tabs with a pill underline marking the
// active one. Compose with `Tabs.Tab`:
//   <Tabs>
//     <Tabs.Tab active={tab === 'a'} onPress={() => setTab('a')}>A</Tabs.Tab>
//     <Tabs.Tab active={tab === 'b'} onPress={() => setTab('b')}>B</Tabs.Tab>
//   </Tabs>
export function Tabs({ children, style, ...props }: TabsProps) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.align_center,
        {
          borderBottomWidth: 1,
          borderBottomColor: theme.palette.neutral_25,
        },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

type TabProps = {
  children: string;
  active?: boolean;
} & Omit<ComponentProps<typeof Pressable>, 'children' | 'style'>;

function Tab({ children, active = false, ...props }: TabProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ hovered, pressed }) => [
        Atoms.flex_1,
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.justify_center,
        (hovered || pressed) && {
          backgroundColor: theme.palette.neutral_25,
        },
      ]}
      {...props}
    >
      <View style={[Atoms.p_md, Atoms.self_center, Atoms.justify_center]}>
        <Text
          variant="secondary"
          fontWeight={active ? 'bold' : 'regular'}
          color={active ? 'neutral_900' : 'neutral_500'}
          selectable={false}
        >
          {children}
        </Text>
        {active && (
          <View
            style={[
              Atoms.absolute,
              Atoms.self_center,
              Atoms.w_full,
              Atoms.rounded_full,
              {
                height: 4,
                minWidth: 56,
                bottom: 0,
                backgroundColor: theme.palette.primary_500,
              },
            ]}
          />
        )}
      </View>
    </Pressable>
  );
}

Tabs.Tab = Tab;

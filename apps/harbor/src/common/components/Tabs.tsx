import { Atoms, Spacing, typography, useTheme } from '@/src/common/theme';
import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactElement,
} from 'react';
import { Pressable, View } from 'react-native';
import { HorizontalScrollGroup, Text } from './primitives';

/** See `expand` in `TabsProps`. */
const ExpandContext = createContext(true);

/** Exported so a sticky header containing tabs can reserve their space. */
export const TABS_HEIGHT = Spacing.md * 2 + typography.lineHeight.md + 1;

type TabsProps = {
  children: (ReactElement<TabProps> | boolean)[] | ReactElement<TabProps>;

  /**
   * When true or unspecified, tabs will expand to take all available horizontal
   * space.
   * When false, tabs will be sized based on their content and the tab bar will
   * be horizontally scrollable.
   * This is useful when the number of tabs is dynamic and may get pretty large.
   */
  expand?: boolean;
} & ComponentProps<typeof View>;

// A bar of tabs with a pill underline marking the active one. Compose with
// `Tabs.Tab`:
//   <Tabs>
//     <Tabs.Tab active={tab === 'a'} onPress={() => setTab('a')}>A</Tabs.Tab>
//     <Tabs.Tab active={tab === 'b'} onPress={() => setTab('b')}>B</Tabs.Tab>
//   </Tabs>
export function Tabs({ children, expand = true, style, ...props }: TabsProps) {
  const { theme } = useTheme();

  const surface = {
    backgroundColor: theme.palette.neutral_0,
    borderBottomWidth: 1,
    borderBottomColor: theme.palette.neutral_25,
  };

  return (
    <ExpandContext.Provider value={expand}>
      {expand ? (
        <View
          style={[
            Atoms.flex_row,
            Atoms.align_center,
            surface,
            { minHeight: TABS_HEIGHT },
            style,
          ]}
          {...props}
        >
          {children}
        </View>
      ) : (
        <HorizontalScrollGroup
          style={[Atoms.flex_grow_0, surface, style]}
          contentContainerStyle={Atoms.px_lg}
          {...props}
        >
          {children}
        </HorizontalScrollGroup>
      )}
    </ExpandContext.Provider>
  );
}

type TabProps = {
  children: string;
  active?: boolean;
} & Omit<ComponentProps<typeof Pressable>, 'children' | 'style'>;

function Tab({ children, active = false, ...props }: TabProps) {
  const { theme } = useTheme();
  const expand = useContext(ExpandContext);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ hovered, pressed }) => [
        expand && Atoms.flex_1,
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.justify_center,
        (hovered || pressed) && {
          backgroundColor: theme.palette.neutral_25,
        },
      ]}
      {...props}
    >
      <View
        style={[
          Atoms.p_md,
          Atoms.self_center,
          Atoms.justify_center,
          Atoms.items_center,
          { minWidth: 56 },
        ]}
      >
        <Text
          variant="secondary"
          // Content-sized tabs keep a constant weight so they don't change
          // width when selected.
          fontWeight={expand ? (active ? 'bold' : 'regular') : 'semibold'}
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

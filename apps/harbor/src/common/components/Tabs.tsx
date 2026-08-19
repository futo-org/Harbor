import { Atoms, useTheme } from '@/src/common/theme';
import {
  Children,
  createContext,
  useCallback,
  useContext,
  useRef,
  type ComponentProps,
  type ReactElement,
} from 'react';
import { type LayoutChangeEvent, Pressable, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { TABS_HEIGHT } from './metrics';
import { HorizontalScrollGroup, Text } from './primitives';

/** See `expand` in `TabsProps`. */
const ExpandContext = createContext(true);

export { TABS_HEIGHT };

const INDICATOR_HEIGHT = 4;

/** Where a tab sits in the bar, and how wide its label is. */
type TabMetrics = { x: number; width: number; contentWidth: number };

const TabIndexContext = createContext(0);

/** Set while a sliding indicator is in play; tabs then report their position
 *  instead of drawing their own underline. */
const SlidingIndicatorContext = createContext<
  ((index: number, patch: Partial<TabMetrics>) => void) | null
>(null);

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

  /**
   * Fractional tab index, e.g. a `PagerView`'s swipe. One indicator then slides
   * between tabs following it, rather than each tab drawing its own underline.
   */
  progress?: SharedValue<number>;
} & ComponentProps<typeof View>;

// A bar of tabs with a pill underline marking the active one. Compose with
// `Tabs.Tab`:
//   <Tabs>
//     <Tabs.Tab active={tab === 'a'} onPress={() => setTab('a')}>A</Tabs.Tab>
//     <Tabs.Tab active={tab === 'b'} onPress={() => setTab('b')}>B</Tabs.Tab>
//   </Tabs>
export function Tabs({
  children,
  expand = true,
  progress,
  style,
  ...props
}: TabsProps) {
  const { theme } = useTheme();

  const surface = {
    backgroundColor: theme.palette.neutral_0,
    borderBottomWidth: 1,
    borderBottomColor: theme.palette.neutral_25,
  };

  // Reported in two parts — the tab's slot, then its label — so merge per tab.
  const metrics = useSharedValue<TabMetrics[]>([]);
  const measured = useRef<TabMetrics[]>([]);
  const report = useCallback(
    (index: number, patch: Partial<TabMetrics>) => {
      // Zero widths come from a layout pass mid-measure; storing one would
      // leave the indicator with nothing to sit on.
      if (patch.width === 0 || patch.contentWidth === 0) return;

      const prev = measured.current[index] ?? {
        x: 0,
        width: 0,
        contentWidth: 0,
      };
      const next = { ...prev, ...patch };
      if (
        prev.x === next.x &&
        prev.width === next.width &&
        prev.contentWidth === next.contentWidth
      ) {
        return;
      }
      const updated = [...measured.current];
      updated[index] = next;
      measured.current = updated;
      metrics.value = updated;
    },
    [metrics],
  );

  const indicatorStyle = useAnimatedStyle(() => {
    const tabs = metrics.value;
    const hidden = { opacity: 0, width: 0, transform: [{ translateX: 0 }] };
    if (!progress || tabs.length === 0) return hidden;

    const clamped = Math.min(Math.max(progress.value, 0), tabs.length - 1);
    const from = tabs[Math.floor(clamped)];
    const to = tabs[Math.ceil(clamped)];
    // Both ends have to be measured before there is a position to interpolate.
    if (!from || !to || from.contentWidth <= 0 || to.contentWidth <= 0) {
      return hidden;
    }

    const ratio = clamped - Math.floor(clamped);
    const width =
      from.contentWidth + (to.contentWidth - from.contentWidth) * ratio;
    const fromCenter = from.x + from.width / 2;
    const center = fromCenter + (to.x + to.width / 2 - fromCenter) * ratio;

    return {
      opacity: 1,
      width,
      transform: [{ translateX: center - width / 2 }],
    };
  });

  const indexedChildren = Children.toArray(children).map((child, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a tab's position is its identity
    <TabIndexContext.Provider key={index} value={index}>
      {child}
    </TabIndexContext.Provider>
  ));

  return (
    <ExpandContext.Provider value={expand}>
      <SlidingIndicatorContext.Provider value={progress ? report : null}>
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
            {indexedChildren}
            {progress ? (
              <Animated.View
                style={[
                  Atoms.absolute,
                  Atoms.rounded_full,
                  {
                    left: 0,
                    bottom: 0,
                    height: INDICATOR_HEIGHT,
                    backgroundColor: theme.palette.primary_500,
                  },
                  indicatorStyle,
                ]}
              />
            ) : null}
          </View>
        ) : (
          <HorizontalScrollGroup
            style={[Atoms.flex_grow_0, surface, style]}
            contentContainerStyle={Atoms.px_lg}
            {...props}
          >
            {indexedChildren}
          </HorizontalScrollGroup>
        )}
      </SlidingIndicatorContext.Provider>
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
  const index = useContext(TabIndexContext);
  const report = useContext(SlidingIndicatorContext);

  const onSlotLayout = report
    ? (event: LayoutChangeEvent) => {
        const { x, width } = event.nativeEvent.layout;
        report(index, { x, width });
      }
    : undefined;

  const onLabelLayout = report
    ? (event: LayoutChangeEvent) => {
        report(index, { contentWidth: event.nativeEvent.layout.width });
      }
    : undefined;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onLayout={onSlotLayout}
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
        onLayout={onLabelLayout}
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
        {/* With a sliding indicator the bar draws the underline instead. */}
        {active && !report && (
          <View
            style={[
              Atoms.absolute,
              Atoms.self_center,
              Atoms.w_full,
              Atoms.rounded_full,
              {
                height: INDICATOR_HEIGHT,
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

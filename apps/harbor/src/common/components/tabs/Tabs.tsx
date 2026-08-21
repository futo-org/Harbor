import { Atoms, useTheme } from '@/src/common/theme';
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { type LayoutChangeEvent, Pressable, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Icon from '../Icon';
import { TABS_HEIGHT } from '../metrics';
import {
  HorizontalScrollGroup,
  type HorizontalScrollGroupRef,
  Text,
} from '../primitives';

/** See `expand` in `TabsProps`. */
const ExpandContext = createContext(true);

/** Lets the active tab scroll itself into view when the bar overflows. */
const RevealContext = createContext<(x: number, width: number) => void>(
  () => {},
);

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

  const groupRef = useRef<HorizontalScrollGroupRef>(null);
  const reveal = useCallback((x: number, width: number) => {
    groupRef.current?.reveal(x, width);
  }, []);

  // Reported in two parts — the tab's slot, then its label — so merge per
  // tab. Held as state so measurements landing re-commits the resting frame.
  const [measured, setMeasured] = useState<TabMetrics[]>([]);
  const report = useCallback((index: number, patch: Partial<TabMetrics>) => {
    // Zero widths come from a layout pass mid-measure; storing one would
    // leave the indicator with nothing to sit on.
    if (patch.width === 0 || patch.contentWidth === 0) return;

    setMeasured((current) => {
      const prev = current[index] ?? { x: 0, width: 0, contentWidth: 0 };
      const next = { ...prev, ...patch };
      if (
        prev.x === next.x &&
        prev.width === next.width &&
        prev.contentWidth === next.contentWidth
      ) {
        return current;
      }
      const updated = [...current];
      updated[index] = next;
      return updated;
    });
  }, []);

  const metrics = useSharedValue<TabMetrics[]>([]);
  useEffect(() => {
    metrics.value = measured;
  }, [metrics, measured]);

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

  // Android can lose the worklet's UI-thread style apply (reanimated #6298).
  const childArray = Children.toArray(children);
  const activeTab =
    measured[
      childArray.findIndex(
        (child) => isValidElement<TabProps>(child) && child.props.active,
      )
    ];
  const restingStyle = activeTab?.contentWidth
    ? {
        opacity: 1,
        width: activeTab.contentWidth,
        transform: [
          {
            translateX:
              activeTab.x + (activeTab.width - activeTab.contentWidth) / 2,
          },
        ],
      }
    : { opacity: 0, width: 0 };

  const indexedChildren = childArray.map((child, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a tab's position is its identity
    <TabIndexContext.Provider key={index} value={index}>
      {child}
    </TabIndexContext.Provider>
  ));

  return (
    <ExpandContext.Provider value={expand}>
      <RevealContext.Provider value={reveal}>
        <SlidingIndicatorContext.Provider value={progress ? report : null}>
          <HorizontalScrollGroup
            ref={groupRef}
            style={[Atoms.flex_grow_0, surface, style]}
            // Tabs never shrink below their label, so an overflowing bar
            // scrolls instead of wrapping.
            contentContainerStyle={[
              expand ? Atoms.flex_grow_1 : Atoms.px_lg,
              { minHeight: TABS_HEIGHT },
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
                  restingStyle,
                ]}
              />
            ) : null}
          </HorizontalScrollGroup>
        </SlidingIndicatorContext.Provider>
      </RevealContext.Provider>
    </ExpandContext.Provider>
  );
}

type TabProps = {
  children: string;
  active?: boolean;
  /** Renders the tab's menu, marked by a down chevron; pressing the tab
   *  while active opens it instead of firing `onPress`. */
  menu?: (props: { open: boolean; onClose: () => void }) => ReactNode;
} & Omit<ComponentProps<typeof Pressable>, 'children' | 'style'>;

function Tab({ children, active = false, menu, onPress, ...props }: TabProps) {
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const expand = useContext(ExpandContext);
  const index = useContext(TabIndexContext);
  const report = useContext(SlidingIndicatorContext);
  const reveal = useContext(RevealContext);

  // Scroll into view when becoming active, and again if layout lands after
  // the tab was already active (deep links).
  const slot = useRef({ x: 0, width: 0 });
  useEffect(() => {
    if (active && slot.current.width) {
      reveal(slot.current.x, slot.current.width);
    }
  }, [active, reveal]);

  const onSlotLayout = (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    slot.current = { x, width };
    if (active) reveal(x, width);
    report?.(index, { x, width });
  };

  const onLabelLayout = report
    ? (event: LayoutChangeEvent) => {
        report(index, { contentWidth: event.nativeEvent.layout.width });
      }
    : undefined;

  return (
    <>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={(event) => {
          if (menu && active) {
            setMenuOpen(true);
            return;
          }
          onPress?.(event);
        }}
        onLayout={onSlotLayout}
        style={({ hovered, pressed }) => [
          expand && Atoms.flex_grow_1,
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
            Atoms.flex_row,
            Atoms.gap_xs,
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
          {menu && (
            <Icon
              name="chevronDown"
              size={14}
              color={active ? 'neutral_900' : 'neutral_500'}
              // The glyph's ink centers on the cap height; sink it to the
              // mostly-lowercase label's x-height center.
              style={{ transform: [{ translateY: 2 }] }}
            />
          )}
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
      {menu?.({ open: menuOpen, onClose: () => setMenuOpen(false) })}
    </>
  );
}

Tabs.Tab = Tab;

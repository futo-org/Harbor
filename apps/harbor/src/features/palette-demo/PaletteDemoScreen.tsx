import { PillButton, Text } from '@/src/common/components/primitives';
import {
  Atoms,
  BorderRadius,
  THEME_PREFERENCE_OPTIONS,
  useTheme,
} from '@/src/common/theme';
import { buildThemeColors, type TextColor } from '@/src/common/theme/colors';
import { buildThemeColors as buildThemeColorsNew } from '@/src/common/theme/colors_new';
import { darkPalette, lightPalette } from '@/src/common/theme/palette';
import { palette as paletteNew } from '@/src/common/theme/palette_new';
import { Context as ThemeContext } from '@/src/common/theme/provider';
import type { Theme, ThemeScheme } from '@/src/common/theme/themes';
import { type ReactNode, useMemo, useState } from 'react';
import {
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

// Temporary page for reviewing the palette; not linked from anywhere.

const SWATCH_WIDTH = 104;
const SWATCH_HEIGHT = 28;
const ROW_LABEL_WIDTH = 80;

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

type ColorsSource = 'colors' | 'colors_new';

export default function PaletteDemoScreen() {
  const themeContext = useTheme();
  const [source, setSource] = useState<ColorsSource>('colors');
  const { scheme } = themeContext.theme;

  const { theme, palette } = useMemo(
    () => buildDemoTheme(source, scheme),
    [source, scheme],
  );
  // overrides the theme for the whole page, `Text` and buttons included
  const demoThemeContext = useMemo(
    () => ({ ...themeContext, theme }),
    [themeContext, theme],
  );

  return (
    <ThemeContext.Provider value={demoThemeContext}>
      <PaletteDemo
        source={source}
        onSourceChange={setSource}
        palette={palette}
      />
    </ThemeContext.Provider>
  );
}

type PaletteDemoProps = {
  source: ColorsSource;
  onSourceChange: (source: ColorsSource) => void;
  palette: Record<string, string>;
};

function PaletteDemo({ source, onSourceChange, palette }: PaletteDemoProps) {
  const { theme } = useTheme();

  return (
    <ScrollView
      style={[Atoms.flex_1, theme.atoms.box.primary.bg]}
      contentContainerStyle={[Atoms.p_md, Atoms.gap_lg]}
    >
      <View style={[Atoms.flex_row, Atoms.justify_between, Atoms.items_center]}>
        <Text variant="title" fontWeight="bold">
          Palette demo
        </Text>
        <View style={[Atoms.flex_row, Atoms.gap_md]}>
          <View style={[Atoms.flex_row, Atoms.gap_xs]}>
            {(['colors', 'colors_new'] as const).map((option) => (
              <PillButton
                key={option}
                title={option}
                variant={option === source ? 'primary' : 'secondary'}
                onPress={() => onSourceChange(option)}
              />
            ))}
          </View>
          <ThemeSwitcher />
        </View>
      </View>

      <Section title="Text">
        {(['primary', 'secondary'] as const).map((box) => (
          <View
            key={box}
            style={[
              Atoms.flex_row,
              Atoms.flex_wrap,
              Atoms.gap_md,
              Atoms.px_sm,
              Atoms.py_xs,
              Atoms.rounded_sm,
              theme.atoms.box[box].bg,
            ]}
          >
            {TEXT_COLORS.map((color) => (
              <Text key={color} color={color}>
                {color}
              </Text>
            ))}
          </View>
        ))}
      </Section>

      <Section title="Boxes">
        {Object.entries(theme.colors.box).map(([name, box]) => {
          const entries: [string, string][] = Object.entries(box);
          // the hue boxes' solid fills take light text
          const isSolidHue = !['primary', 'secondary', 'raised'].includes(name);
          return (
            <Row key={name} label={name}>
              {entries
                .filter(([key]) => key.startsWith('bg'))
                .map(([fill, value]) => (
                  <Swatch
                    key={fill}
                    label={fill}
                    color={
                      isSolidHue && !fill.startsWith('bg_subtle')
                        ? 'light'
                        : 'primary'
                    }
                    style={{
                      backgroundColor: value,
                      borderWidth: 1,
                      borderColor: fill.startsWith('bg_subtle')
                        ? ('border_subtle' in box && box.border_subtle) ||
                          box.border
                        : box.border,
                    }}
                  />
                ))}
              {entries
                .filter(([key]) => key.startsWith('border'))
                .map(([border, value]) => (
                  <Swatch
                    key={border}
                    label={border}
                    style={{ borderColor: value, borderWidth: 2 }}
                  />
                ))}
            </Row>
          );
        })}
      </Section>

      <Section title="Outlines">
        <View style={[Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_sm]}>
          {(['outline', 'outline_strong'] as const).map((outline) => (
            <Swatch
              key={outline}
              label={outline}
              style={[theme.atoms[outline], { borderWidth: 2 }]}
            />
          ))}
        </View>
      </Section>

      <Section title="Overlays and shadows">
        <View style={[Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_sm]}>
          {(
            [
              ['backdrop.modal', theme.colors.backdrop.modal],
              ['backdrop.media', theme.colors.backdrop.media],
              ['media_control', theme.colors.media_control.bg],
              ['transparent', theme.colors.transparent],
            ] as const
          ).map(([label, value]) => (
            <OverlaySwatch key={label} label={label} value={value} />
          ))}
          {Object.entries(theme.atoms.shadow).map(([name, shadow]) => (
            <Swatch
              key={name}
              label={`shadow.${name}`}
              style={[theme.atoms.box.primary.bg, shadow]}
            />
          ))}
        </View>
      </Section>

      <PaletteSection palette={palette} />
    </ScrollView>
  );
}

function ThemeSwitcher() {
  const { themePreference, setThemePreference } = useTheme();
  return (
    <View style={[Atoms.flex_row, Atoms.gap_xs]}>
      {THEME_PREFERENCE_OPTIONS.map(({ preference, label, icon }) => (
        <PillButton
          key={preference}
          title={label}
          icon={icon}
          variant={preference === themePreference ? 'primary' : 'secondary'}
          onPress={() => setThemePreference(preference)}
        />
      ))}
    </View>
  );
}

function PaletteSection({ palette }: { palette: Record<string, string> }) {
  // `neutral_500` goes to the `neutral` scale as `500`; unnumbered names to `other`.
  const scales = new Map<string, { step: string; value: string }[]>();
  for (const [name, value] of Object.entries(palette)) {
    const match = name.match(/^(.+)_(\d+)$/);
    const scale = match ? match[1] : 'other';
    const step = match ? match[2] : name;
    scales.set(scale, [...(scales.get(scale) ?? []), { step, value }]);
  }

  // the hue scales lack neutral's 0 and 1000, so they get empty cells there
  const neutralSteps = scales.get('neutral')?.map(({ step }) => step) ?? [];

  return (
    <Section title="Palette">
      {[...scales].map(([scale, steps]) => (
        <Row key={scale} label={scale}>
          {(scale === 'other'
            ? steps
            : neutralSteps.map(
                (step) =>
                  steps.find((entry) => entry.step === step) ?? {
                    step,
                    value: undefined,
                  },
              )
          ).map(({ step, value }) =>
            value === undefined ? (
              <View key={step} style={Atoms.flex_1} />
            ) : (
              <View
                key={step}
                style={[
                  Atoms.flex_1,
                  Atoms.items_center,
                  Atoms.justify_center,
                  { height: SWATCH_HEIGHT, backgroundColor: value },
                ]}
              >
                <Text
                  variant="small"
                  color={isDarkColor(value) ? 'light' : 'dark'}
                  numberOfLines={1}
                >
                  {step}
                </Text>
              </View>
            ),
          )}
        </Row>
      ))}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={Atoms.gap_sm}>
      <Text variant="subtitle" fontWeight="bold">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={[Atoms.flex_row, Atoms.items_center]}>
      <Text variant="small" style={{ width: ROW_LABEL_WIDTH }}>
        {label}
      </Text>
      <View style={[Atoms.flex_1, Atoms.flex_row, Atoms.gap_xs]}>
        {children}
      </View>
    </View>
  );
}

type SwatchProps = {
  label: string;
  color?: TextColor;
  style: StyleProp<ViewStyle>;
};

function Swatch({ label, color = 'primary', style }: SwatchProps) {
  return (
    <View
      style={[
        Atoms.items_center,
        Atoms.justify_center,
        {
          width: SWATCH_WIDTH,
          height: SWATCH_HEIGHT,
          borderRadius: BorderRadius.sm,
        },
        style,
      ]}
    >
      <Text variant="small" color={color} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Translucent colors drawn over a two-tone background so the opacity shows.
function OverlaySwatch({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.overflow_hidden,
        {
          width: SWATCH_WIDTH,
          height: SWATCH_HEIGHT,
          borderRadius: BorderRadius.sm,
        },
      ]}
    >
      <View style={[Atoms.flex_1, theme.atoms.box.accent.bg]} />
      <View style={[Atoms.flex_1, theme.atoms.box.primary.bg]} />
      <View
        style={[
          StyleSheet.absoluteFill,
          Atoms.items_center,
          Atoms.justify_center,
          { backgroundColor: value },
        ]}
      >
        <Text variant="small" color="light" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

// palette colors are #RRGGBB
function isDarkColor(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16),
  );
  return 0.299 * red + 0.587 * green + 0.114 * blue < 150;
}

// `colors_new` picks both themes from one palette; `colors` has one per theme.
function buildDemoTheme(
  source: ColorsSource,
  scheme: ThemeScheme,
): { theme: Theme; palette: Record<string, string> } {
  if (source === 'colors_new') {
    return {
      palette: paletteNew,
      theme: { scheme, ...buildThemeColorsNew(scheme) },
    };
  }
  const palette = scheme === 'dark' ? darkPalette : lightPalette;
  return { palette, theme: { scheme, ...buildThemeColors(palette, scheme) } };
}

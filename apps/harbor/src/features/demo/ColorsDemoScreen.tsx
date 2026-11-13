import SCENE_SPLASH from '@/src/common/assets/images/harbor-scene-splash.svg';
import { Text } from '@/src/common/components';
import { SegmentedButton } from '@/src/common/components/SegmentedButton';
import { usePageTitle } from '@/src/common/lib/navigation/usePageTitle';
import {
  Atoms,
  BorderRadius,
  createThemedStyles,
  THEME_PREFERENCE_OPTIONS,
  type Theme,
  useTheme,
} from '@/src/common/theme';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

const MOCK_SCREEN_WIDTH = 360;
const MOCK_SCREEN_HEIGHT = 280;
const SAMPLE_SENTENCE = 'The quick brown fox jumps over the lazy dog';

type ColorAtoms = Theme['atoms_new'];
type BoxName = keyof ColorAtoms['box'];

const TEXT_NAMES = [
  'primary',
  'secondary',
  'muted',
  'accent',
  'danger',
  'success',
  'warning',
] as const;

// boxes whose subtle variant takes the matching text color
const HUE_NAMES = ['accent', 'danger', 'success', 'warning'] as const;
type OverlayStateName = 'hover' | 'pressed' | 'selected';

const OVERLAY_STATES: (OverlayStateName | null)[] = [
  null,
  'hover',
  'pressed',
  'selected',
];

// Web-only page that renders every value of `theme.atoms_new` in a typical context
export default function ColorsDemoScreen() {
  usePageTitle('Theme colors');
  const { themePreference, setThemePreference } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text variant="title">theme.atoms_new</Text>
        <SegmentedButton
          segments={THEME_PREFERENCE_OPTIONS.map(
            ({ preference, label, icon }) => ({
              label,
              icon,
              active: themePreference === preference,
              onPress: () => setThemePreference(preference),
            }),
          )}
        />
      </View>

      <Section
        title="text"
        description="Text and icons placed directly on a background."
      >
        <OnEachBackground>
          <TextSamples />
        </OnEachBackground>
      </Section>

      <Section
        title="box"
        description="Each box as a solid button (bg, border, white text) and as a subtle pill (bg_subtle, border_subtle, text color of its hue)."
      >
        <OnEachBackground>
          <BoxSamples />
        </OnEachBackground>
      </Section>

      <Section
        title="overlay.hover / pressed / selected"
        description="Drawn over list rows and over boxes."
      >
        <OnEachBackground>
          <StateOverlaySamples />
        </OnEachBackground>
      </Section>

      <Section
        title="overlay.modal_backdrop"
        description="Dims the screen behind a sheet or drawer."
      >
        <ModalBackdropSample />
      </Section>

      <Section
        title="overlay.media_backdrop / media_control"
        description="Controls on top of images, and the full-screen image viewer."
      >
        <View style={[Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_2xl]}>
          <PostImageSample />
          <ImageViewerSample />
        </View>
      </Section>

      <Section
        title="shadow"
        description="accent: primary button and FAB. neutral: toast and raised card."
      >
        <OnEachBackground>
          <ShadowSamples />
        </OnEachBackground>
      </Section>

      <Section
        title="disabled"
        description="Style applied to a whole control. Left: enabled, right: disabled."
      >
        <OnEachBackground>
          <DisabledSamples />
        </OnEachBackground>
      </Section>
    </View>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();

  return (
    <View style={Atoms.gap_md}>
      <View style={Atoms.gap_xs}>
        <Text variant="subtitle" monospace>
          {title}
        </Text>
        <Text style={theme.atoms_new.muted}>{description}</Text>
      </View>
      {children}
    </View>
  );
}

function OnEachBackground({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const styles = useStyles();
  const backgroundNames: BoxName[] = ['primary', 'secondary'];

  return (
    <View style={[Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_lg]}>
      {backgroundNames.map((name) => (
        <View
          key={name}
          style={[
            styles.backgroundColumn,
            buildBoxStyle(theme.atoms_new, name),
          ]}
        >
          <ColorLabel>{`on box.${name}`}</ColorLabel>
          {children}
        </View>
      ))}
    </View>
  );
}

function TextSamples() {
  const { theme } = useTheme();

  return (
    <View style={Atoms.gap_sm}>
      {TEXT_NAMES.map((name) => (
        <View key={name}>
          <Text style={theme.atoms_new[name]}>{SAMPLE_SENTENCE}</Text>
          <ColorLabel>{`${name} ${formatAtomValues(theme.atoms_new[name])}`}</ColorLabel>
        </View>
      ))}
    </View>
  );
}

function BoxSamples() {
  const { theme } = useTheme();
  const colorAtoms = theme.atoms_new;
  const boxNames = Object.keys(colorAtoms.box) as BoxName[];

  return (
    <View style={Atoms.gap_lg}>
      {boxNames.map((name) => {
        const box = colorAtoms.box[name];
        return (
          <View key={name} style={Atoms.gap_xs}>
            <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md]}>
              <SolidBox name={name}>Button</SolidBox>
              <SubtleBox name={name}>Subtle</SubtleBox>
              <Text monospace fontWeight="semibold">
                {`box.${name}`}
              </Text>
            </View>
            <ColorLabel>
              {Object.entries(box)
                .map(([key, atom]) => `${key} ${formatAtomValues(atom)}`)
                .join('  ')}
            </ColorLabel>
          </View>
        );
      })}
    </View>
  );
}

function StateOverlaySamples() {
  const { theme } = useTheme();
  const colorAtoms = theme.atoms_new;

  return (
    <View style={Atoms.gap_lg}>
      <View>
        {OVERLAY_STATES.map((state) => (
          <View
            key={state ?? 'none'}
            style={[Atoms.px_md, Atoms.py_sm, Atoms.rounded_md]}
          >
            <StateOverlay state={state} />
            <Text>{`List row - ${state ?? 'no overlay'}`}</Text>
          </View>
        ))}
      </View>
      <View style={[Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_sm]}>
        {OVERLAY_STATES.map((state) => (
          <SolidBox key={state ?? 'none'} name="accent" state={state}>
            {state ?? 'none'}
          </SolidBox>
        ))}
      </View>
      <View style={[Atoms.flex_row, Atoms.flex_wrap, Atoms.gap_sm]}>
        {OVERLAY_STATES.map((state) => (
          <SubtleBox key={state ?? 'none'} name="neutral" state={state}>
            {state ?? 'none'}
          </SubtleBox>
        ))}
      </View>
      <ColorLabel>
        {`hover ${formatAtomValues(colorAtoms.overlay.hover)}  pressed ${formatAtomValues(colorAtoms.overlay.pressed)}  selected ${formatAtomValues(colorAtoms.overlay.selected)}`}
      </ColorLabel>
    </View>
  );
}

function ModalBackdropSample() {
  const { theme } = useTheme();
  const colorAtoms = theme.atoms_new;
  const styles = useStyles();

  return (
    <View style={Atoms.gap_xs}>
      <View style={styles.mockScreen}>
        <FakeFeed />
        <View
          style={[StyleSheet.absoluteFill, colorAtoms.overlay.modal_backdrop]}
        />
        <View style={styles.mockSheet}>
          <Text fontWeight="semibold">Sheet</Text>
          <Text style={colorAtoms.secondary}>
            Content behind is dimmed by the backdrop.
          </Text>
          <SolidBox name="accent">Confirm</SolidBox>
        </View>
      </View>
      <ColorLabel>{`overlay.modal_backdrop ${formatAtomValues(colorAtoms.overlay.modal_backdrop)}`}</ColorLabel>
    </View>
  );
}

function PostImageSample() {
  const { theme } = useTheme();
  const styles = useStyles();

  return (
    <View style={Atoms.gap_xs}>
      <View style={styles.mockScreen}>
        <Image
          source={SCENE_SPLASH}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.mediaCorner, { top: 8, right: 8 }]}>
          <MediaControl>✕</MediaControl>
        </View>
        <View style={[styles.mediaCorner, { bottom: 8, left: 8 }]}>
          <MediaControl>ALT</MediaControl>
        </View>
        <View style={[styles.mediaCorner, { bottom: 8, right: 8 }]}>
          <MediaControl>1 / 3</MediaControl>
        </View>
      </View>
      <ColorLabel>
        {`media_control.bg ${formatAtomValues(theme.atoms_new.media_control.bg)}  white ${formatAtomValues(theme.atoms_new.white)}`}
      </ColorLabel>
    </View>
  );
}

function ImageViewerSample() {
  const { theme } = useTheme();
  const colorAtoms = theme.atoms_new;
  const styles = useStyles();

  return (
    <View style={Atoms.gap_xs}>
      <View style={styles.mockScreen}>
        <FakeFeed />
        <View
          style={[
            StyleSheet.absoluteFill,
            Atoms.align_center,
            Atoms.justify_center,
            colorAtoms.overlay.media_backdrop,
          ]}
        >
          <Image
            source={SCENE_SPLASH}
            contentFit="contain"
            style={styles.viewerImage}
          />
        </View>
        <View style={[styles.mediaCorner, { top: 8, left: 8 }]}>
          <MediaControl>✕</MediaControl>
        </View>
        <View style={[styles.mediaCorner, { top: 8, right: 8 }]}>
          <MediaControl>2 / 3</MediaControl>
        </View>
        <View style={styles.navDotsRow}>
          <View
            style={[
              Atoms.flex_row,
              Atoms.gap_xs,
              Atoms.p_xs,
              Atoms.rounded_full,
              colorAtoms.media_control.bg,
            ]}
          >
            {[0, 1, 2].map((index) => (
              <View
                key={index}
                style={[
                  styles.navDot,
                  // dots are glyphs on the control, so they take the text color
                  { backgroundColor: theme.colors.white },
                  // the current image's dot is wider
                  index === 1 && { width: 14 },
                ]}
              />
            ))}
          </View>
        </View>
      </View>
      <ColorLabel>{`overlay.media_backdrop ${formatAtomValues(colorAtoms.overlay.media_backdrop)}`}</ColorLabel>
    </View>
  );
}

function ShadowSamples() {
  const { theme } = useTheme();
  const colorAtoms = theme.atoms_new;

  return (
    <View style={Atoms.gap_lg}>
      <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_lg]}>
        <View style={[Atoms.rounded_full, colorAtoms.shadow.accent]}>
          <SolidBox name="accent">Post</SolidBox>
        </View>
        <View
          style={[
            Atoms.p_lg,
            Atoms.rounded_full,
            colorAtoms.box.accent.bg,
            colorAtoms.shadow.accent,
          ]}
        >
          <Text fontWeight="bold" style={colorAtoms.white}>
            +
          </Text>
        </View>
      </View>
      <View
        style={[
          Atoms.p_lg,
          Atoms.rounded_lg,
          Atoms.gap_xs,
          ...buildBoxStyle(colorAtoms, 'primary'),
          colorAtoms.shadow.neutral,
        ]}
      >
        <Text fontWeight="semibold">Raised card</Text>
        <Text style={colorAtoms.secondary}>Toasts and the QR card</Text>
      </View>
      <ColorLabel>
        {`accent ${formatAtomValues(colorAtoms.shadow.accent)}  neutral ${formatAtomValues(colorAtoms.shadow.neutral)}`}
      </ColorLabel>
    </View>
  );
}

function DisabledSamples() {
  const { theme } = useTheme();

  return (
    <View style={Atoms.gap_sm}>
      <View style={[Atoms.flex_row, Atoms.gap_sm]}>
        <SolidBox name="accent">Post</SolidBox>
        <View style={theme.atoms_new.disabled}>
          <SolidBox name="accent">Post</SolidBox>
        </View>
      </View>
      <View style={[Atoms.flex_row, Atoms.gap_sm]}>
        <SubtleBox name="danger">Delete</SubtleBox>
        <View style={theme.atoms_new.disabled}>
          <SubtleBox name="danger">Delete</SubtleBox>
        </View>
      </View>
      <ColorLabel>{`disabled ${formatAtomValues(theme.atoms_new.disabled)}`}</ColorLabel>
    </View>
  );
}

function SolidBox({
  name,
  state = null,
  children,
}: {
  name: BoxName;
  state?: OverlayStateName | null;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const colorAtoms = theme.atoms_new;
  const isBackground = name === 'primary' || name === 'secondary';

  return (
    <View
      style={[
        Atoms.px_lg,
        Atoms.py_sm,
        Atoms.rounded_full,
        Atoms.overflow_hidden,
        Atoms.self_start,
        ...buildBoxStyle(colorAtoms, name),
      ]}
    >
      <StateOverlay state={state} />
      <Text
        fontWeight="semibold"
        style={isBackground ? colorAtoms.primary : colorAtoms.white}
      >
        {children}
      </Text>
    </View>
  );
}

function SubtleBox({
  name,
  state = null,
  children,
}: {
  name: BoxName;
  state?: OverlayStateName | null;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const colorAtoms = theme.atoms_new;
  const box = colorAtoms.box[name];
  const textAtom = isHueName(name) ? colorAtoms[name] : colorAtoms.primary;

  return (
    <View
      style={[
        Atoms.px_lg,
        Atoms.py_sm,
        Atoms.rounded_full,
        Atoms.overflow_hidden,
        Atoms.self_start,
        box.bg_subtle,
        box.border_subtle,
        { borderWidth: 1 },
      ]}
    >
      <StateOverlay state={state} />
      <Text fontWeight="semibold" style={textAtom}>
        {children}
      </Text>
    </View>
  );
}

function StateOverlay({ state }: { state: OverlayStateName | null }) {
  const { theme } = useTheme();
  if (!state) {
    return null;
  }
  return (
    <View style={[StyleSheet.absoluteFill, theme.atoms_new.overlay[state]]} />
  );
}

function MediaControl({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.px_sm,
        Atoms.py_xs,
        Atoms.rounded_full,
        theme.atoms_new.media_control.bg,
      ]}
    >
      <Text variant="small" style={theme.atoms_new.white}>
        {children}
      </Text>
    </View>
  );
}

// Stand-in screen content for backdrops to cover
function FakeFeed() {
  const { theme } = useTheme();
  const colorAtoms = theme.atoms_new;

  return (
    <View style={[Atoms.p_md, Atoms.gap_md]}>
      {[0, 1].map((index) => (
        <View key={index} style={Atoms.gap_xs}>
          <Text fontWeight="semibold">Someone posted</Text>
          <Text style={colorAtoms.secondary}>{SAMPLE_SENTENCE}</Text>
          <View style={[Atoms.flex_row, Atoms.gap_sm]}>
            <SubtleBox name="accent">Reply</SubtleBox>
            <SubtleBox name="neutral">Share</SubtleBox>
          </View>
        </View>
      ))}
    </View>
  );
}

function ColorLabel({ children }: { children: string }) {
  const { theme } = useTheme();

  return (
    <Text
      variant="small"
      monospace
      fontWeight="regular"
      style={theme.atoms_new.muted}
    >
      {children}
    </Text>
  );
}

function buildBoxStyle(colorAtoms: ColorAtoms, name: BoxName) {
  return [
    colorAtoms.box[name].bg,
    colorAtoms.box[name].border,
    { borderWidth: 1 },
  ];
}

function isHueName(name: BoxName): name is (typeof HUE_NAMES)[number] {
  return (HUE_NAMES as readonly string[]).includes(name);
}

// `{ color: '#fff' }` -> `#fff`, for labels
function formatAtomValues(atom: object): string {
  return Object.values(atom).join(' ');
}

const useStyles = createThemedStyles((theme, define) =>
  define({
    page: [Atoms.p_3xl, Atoms.gap_3xl, theme.atoms_new.box.primary.bg],
    header: [
      Atoms.flex_row,
      Atoms.align_center,
      Atoms.justify_between,
      Atoms.gap_lg,
    ],
    backgroundColumn: [
      Atoms.p_xl,
      Atoms.gap_md,
      Atoms.rounded_lg,
      { flexGrow: 1, flexBasis: 420 },
    ],
    mockScreen: [
      Atoms.overflow_hidden,
      Atoms.rounded_lg,
      ...buildBoxStyle(theme.atoms_new, 'primary'),
      { width: MOCK_SCREEN_WIDTH, height: MOCK_SCREEN_HEIGHT },
    ],
    mockSheet: [
      Atoms.absolute,
      Atoms.p_lg,
      Atoms.gap_sm,
      theme.atoms_new.box.primary.bg,
      {
        left: 0,
        right: 0,
        bottom: 0,
        borderTopLeftRadius: BorderRadius.xl,
        borderTopRightRadius: BorderRadius.xl,
      },
    ],
    mediaCorner: [Atoms.absolute],
    viewerImage: { width: '100%', height: '70%' },
    navDotsRow: [
      Atoms.absolute,
      Atoms.align_center,
      { left: 0, right: 0, bottom: 12 },
    ],
    navDot: { width: 6, height: 6, borderRadius: BorderRadius.full },
  }),
);

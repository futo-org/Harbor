import Icon from '@/src/common/components/Icon';
import {
  Atoms,
  Spacing,
  THEME_PREFERENCE_OPTIONS,
  typography,
  useTheme,
} from '@/src/common/theme';
import { type ExternalPathString, Link } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import {
  CONTENT_POLICY_URL,
  DOCS_URL,
  FAQ_URL,
  FUTO_URL,
  PRIVACY_POLICY_URL,
  ROADMAP_URL,
  SOURCE_CODE_URL,
  SUPPORT_URL,
} from '../../constants';

const LINKS: { text: string; href: ExternalPathString }[] = [
  { text: 'Docs', href: DOCS_URL },
  { text: 'FAQ', href: FAQ_URL },
  { text: 'Support', href: SUPPORT_URL },
  { text: 'Roadmap', href: ROADMAP_URL },
  { text: 'Code', href: SOURCE_CODE_URL },
  { text: 'Privacy Policy', href: PRIVACY_POLICY_URL },
  { text: 'Content Policy', href: CONTENT_POLICY_URL },
  { text: 'FUTO © 2026.', href: FUTO_URL },
];

type AppFooterProps = ComponentProps<typeof View> & {
  /** Off where the screen already has a theme control, such as settings. */
  showThemeSwitcher?: boolean;
};

/**
 * Theme toggle and external links row, shown at the bottom of the right
 * sidebar, on the onboarding welcome screen and at the end of settings.
 */
export function AppFooter({
  showThemeSwitcher = true,
  style,
  ...props
}: AppFooterProps) {
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.w_full,
        Atoms.pt_sm,
        Atoms.px_sm,
        Atoms.flex_wrap,
        { columnGap: Spacing.md, rowGap: Spacing.xs },
        style,
      ]}
      {...props}
    >
      {showThemeSwitcher && <ThemeSwitcher />}
      {LINKS.map(({ text, href }) => (
        <FooterLink key={href} href={href} text={text} />
      ))}
    </View>
  );
}

function ThemeSwitcher() {
  const { themePreference, setThemePreference } = useTheme();

  const currentIndex = THEME_PREFERENCE_OPTIONS.findIndex(
    ({ preference }) => preference === themePreference,
  );
  const current = THEME_PREFERENCE_OPTIONS[currentIndex];
  const next =
    THEME_PREFERENCE_OPTIONS[
      (currentIndex + 1) % THEME_PREFERENCE_OPTIONS.length
    ];

  return (
    <Pressable
      accessibilityLabel={`${current.label} theme, switch to ${next.label.toLowerCase()}`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => setThemePreference(next.preference)}
      style={({ pressed }) => [pressed && { opacity: 0.65 }]}
    >
      <Icon
        name={current.icon}
        size={typography.fontSize.sm}
        color="neutral_500"
      />
    </Pressable>
  );
}

type FooterLinkProps = {
  href: ExternalPathString;
  text: string;
};
function FooterLink({ href, text }: FooterLinkProps) {
  const { theme } = useTheme();
  return (
    <Link
      className="underlineOnHover"
      href={href}
      target="_blank"
      accessibilityLabel={text}
      style={theme.atoms.text_neutral_low}
    >
      {text}
    </Link>
  );
}

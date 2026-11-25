import Icon from '@/src/common/components/Icon';
import {
  Atoms,
  Spacing,
  THEME_PREFERENCE_OPTIONS,
  typography,
  useTheme,
} from '@/src/common/theme';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { type ExternalPathString, type Href, Link } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import {
  CONTENT_POLICY_URL,
  DOCS_URL,
  FAQ_URL,
  FUTO_URL,
  MERCH_URL,
  PRIVACY_POLICY_URL,
  ROADMAP_URL,
  SOURCE_CODE_URL,
  Routes,
  SUPPORT_URL,
} from '../../constants';

type FooterLinkProps = {
  /** A page of the app, or a site that opens in a new tab. */
  href: Href | ExternalPathString;
  text: string;
};

// The feedback form is sent as the signed-in identity.
const FEEDBACK: FooterLinkProps = {
  text: 'Feedback',
  href: Routes.tabs.settings.feedback,
};
const SUPPORT: FooterLinkProps = { text: 'Support', href: SUPPORT_URL };

const linksFor = (signedIn: boolean): FooterLinkProps[] => [
  { text: 'Docs', href: DOCS_URL },
  { text: 'FAQ', href: FAQ_URL },
  signedIn ? FEEDBACK : SUPPORT,
  { text: 'Roadmap', href: ROADMAP_URL },
  { text: 'Code', href: SOURCE_CODE_URL },
  { text: 'Merch', href: MERCH_URL },
  { text: 'Privacy', href: PRIVACY_POLICY_URL },
  { text: 'Content Policy', href: CONTENT_POLICY_URL },
];

const COPYRIGHT: FooterLinkProps = { text: '© 2026 FUTO', href: FUTO_URL };

type AppFooterProps = ComponentProps<typeof View> & {
  /** Off where the screen already has a theme control, such as settings. */
  showThemeSwitcher?: boolean;
  showCopyright?: boolean;
};

/**
 * Theme toggle and external links row, shown at the bottom of the right
 * sidebar, on the onboarding welcome screen and at the end of settings.
 */
export function AppFooter({
  showThemeSwitcher = true,
  showCopyright = true,
  style,
  ...props
}: AppFooterProps) {
  const { identity } = useCurrentIdentity();

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
      {linksFor(!!identity).map(({ text, href }) => (
        <FooterLink key={text} href={href} text={text} />
      ))}
      {showCopyright && <FooterLink {...COPYRIGHT} />}
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
      style={({ pressed }) => [pressed && Atoms.faded]}
    >
      <Icon name={current.icon} size={typography.fontSize.sm} color="muted" />
    </Pressable>
  );
}

const isExternal = (href: FooterLinkProps['href']) =>
  typeof href === 'string' && /^https?:/.test(href);

function FooterLink({ href, text }: FooterLinkProps) {
  const { theme } = useTheme();
  return (
    <Link
      className="underlineOnHover"
      href={href}
      target={isExternal(href) ? '_blank' : undefined}
      accessibilityLabel={text}
      style={theme.atoms.muted}
    >
      {text}
    </Link>
  );
}

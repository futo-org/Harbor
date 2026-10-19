import Icon from '@/src/common/components/Icon';
import {
  Atoms,
  THEME_PREFERENCE_OPTIONS,
  typography,
  useTheme,
} from '@/src/common/theme';
import { type ExternalPathString, Link } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import {
  CONTENT_POLICY_URL,
  FUTO_URL,
  PRIVACY_POLICY_URL,
  ROADMAP_URL,
  SOURCE_CODE_URL,
} from '../../constants';

const LINKS: { text: string; href: ExternalPathString }[] = [
  {
    text: 'Privacy Policy',
    href: PRIVACY_POLICY_URL,
  },
  {
    text: 'Content Policy',
    href: CONTENT_POLICY_URL,
  },
  {
    text: 'Code',
    href: SOURCE_CODE_URL,
  },
  {
    text: 'Roadmap',
    href: ROADMAP_URL,
  },
  { text: 'FUTO © 2026.', href: FUTO_URL },
];

/**
 * Theme toggle and external links row, shown at the bottom of the right
 * sidebar and on the onboarding welcome screen.
 */
export function AppFooter({ style, ...props }: ComponentProps<typeof View>) {
  return (
    <View
      style={[
        Atoms.flex_row,
        Atoms.items_center,
        Atoms.w_full,
        Atoms.pt_sm,
        Atoms.px_sm,
        Atoms.gap_md,
        Atoms.flex_wrap,
        style,
      ]}
      {...props}
    >
      <ThemeSwitcher />
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

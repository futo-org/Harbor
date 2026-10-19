import type { PaletteColorToken } from '@/src/common/theme';
// Per-icon modules: importing from the package index would bundle every icon.
import * as faDiscord from '@fortawesome/free-brands-svg-icons/faDiscord';
import * as faGithub from '@fortawesome/free-brands-svg-icons/faGithub';
import * as faHackerNews from '@fortawesome/free-brands-svg-icons/faHackerNews';
import * as faTwitch from '@fortawesome/free-brands-svg-icons/faTwitch';
import * as faXTwitter from '@fortawesome/free-brands-svg-icons/faXTwitter';
import * as faYoutube from '@fortawesome/free-brands-svg-icons/faYoutube';
import * as faCirclePlay from '@fortawesome/free-solid-svg-icons/faCirclePlay';
import * as faGlobe from '@fortawesome/free-solid-svg-icons/faGlobe';
import { createElement, type ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';

// Every platform claim shares one verification schema; which platform a claim
// is for is carried by the verifier route it's sent to, not the schema.
export const PLATFORM_SCHEMA_NAME = 'Platform';

// A platform a claim can be verified against. `slug` is the platform's route
// on the verifier bot; `logo` matches SelectChip's icon render-prop; `color`
// tints the logo and its chip; `location` is where the pairing token goes
// (used in the instructions).
export interface Platform {
  name: string;
  slug: string;
  logo: (props: { size: number; color: string }) => ReactNode;
  color: PaletteColorToken;
  location: string;
  // Example profile URL shown in the input.
  placeholder: string;
  // Builds a profile URL from the account name (used by the OAuth flow,
  // which only learns the name).
  profileUrl?: (account: string) => string;
  // A catch-all for any website not in the list (changes the wording).
  generic?: boolean;
}

// Drawn as SVG rather than through the FontAwesome font, which loads on first
// render and leaves the logo blank until it arrives. `size` is the height,
// like a font glyph's; the width follows the icon's aspect ratio.
const svgLogo =
  ({
    width,
    height,
    svgPathData,
  }: {
    width: number;
    height: number;
    svgPathData: string;
  }) =>
  ({ size, color }: { size: number; color: string }): ReactNode =>
    createElement(
      Svg,
      {
        width: (size * width) / height,
        height: size,
        viewBox: `0 0 ${width} ${height}`,
      },
      createElement(Path, { d: svgPathData, fill: color }),
    );

export const PLATFORMS: Platform[] = [
  {
    name: 'X',
    slug: 'x',
    logo: svgLogo(faXTwitter),
    color: 'neutral_900',
    location: 'bio',
    placeholder: 'x.com/futo',
    profileUrl: (account) => `https://x.com/${account}`,
  },
  {
    name: 'YouTube',
    slug: 'youtube',
    logo: svgLogo(faYoutube),
    color: 'negative_500',
    location: 'channel description',
    // The verifier only accepts @handle or /channel/<id> URLs.
    placeholder: 'youtube.com/@futo_tech',
  },
  {
    name: 'GitHub',
    slug: 'github',
    logo: svgLogo(faGithub),
    color: 'neutral_600',
    location: 'profile bio',
    placeholder: 'github.com/futo-org',
  },
  {
    name: 'Discord',
    slug: 'discord',
    logo: svgLogo(faDiscord),
    color: 'primary_500',
    location: 'About Me',
    placeholder: 'discord.gg/futo',
  },
  {
    name: 'Hacker News',
    slug: 'hacker-news',
    logo: svgLogo(faHackerNews),
    color: 'warning_500',
    location: 'about section',
    placeholder: 'news.ycombinator.com/user?id=futo',
  },
  // FontAwesome has no Rumble brand glyph; use a generic play icon.
  {
    name: 'Rumble',
    slug: 'rumble',
    logo: svgLogo(faCirclePlay),
    color: 'positive_500',
    location: 'channel description',
    placeholder: 'rumble.com/c/futo',
  },
  {
    name: 'Twitch',
    slug: 'twitch',
    logo: svgLogo(faTwitch),
    color: 'primary_400',
    location: 'bio',
    placeholder: 'twitch.tv/futo',
  },
  {
    name: 'Other',
    slug: 'website',
    logo: svgLogo(faGlobe),
    color: 'neutral_500',
    location: 'profile',
    placeholder: 'example.com',
    generic: true,
  },
];

/** Platform metadata for a claim, resolved from its `platform` field. */
export function getPlatformFromClaim(
  schemaName: string,
  fields: { key: string; value: string }[],
): Platform | undefined {
  if (schemaName !== PLATFORM_SCHEMA_NAME) return undefined;
  const slug = fields.find((f) => f.key === 'platform')?.value;
  return slug ? PLATFORMS.find((p) => p.slug === slug) : undefined;
}

// Accepts a profile URL or bare domain: a valid host (FQDN) with an optional
// scheme and path, e.g. "youtube.com/futo-tech" or "https://example.com".
export function isProfileUrl(value: string): boolean {
  const host = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0];
  return /^([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i.test(host);
}

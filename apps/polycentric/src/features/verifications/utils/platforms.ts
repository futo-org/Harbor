import { PaletteColorToken } from '@/src/common/theme';
import { FontAwesome6 } from '@expo/vector-icons';
import { createElement, ReactNode } from 'react';

// A platform a claim can be verified against. `logo` matches SelectChip's icon
// render-prop; `color` tints the logo and its chip; `location` is where the
// pairing token goes (used in the instructions).
export interface Platform {
  name: string;
  logo: (props: { size: number; color: string }) => ReactNode;
  color: PaletteColorToken;
  location: string;
  // Example profile URL shown in the input.
  placeholder: string;
  // A catch-all for any website not in the list (changes the wording).
  generic?: boolean;
}

const brandLogo =
  (name: string) =>
  ({ size, color }: { size: number; color: string }): ReactNode =>
    createElement(FontAwesome6, { name, brand: true, size, color });

const solidLogo =
  (name: string) =>
  ({ size, color }: { size: number; color: string }): ReactNode =>
    createElement(FontAwesome6, { name, size, color });

export const PLATFORMS: Platform[] = [
  {
    name: 'X',
    logo: brandLogo('x-twitter'),
    color: 'neutral_900',
    location: 'bio',
    placeholder: 'x.com/futo',
  },
  {
    name: 'YouTube',
    logo: brandLogo('youtube'),
    color: 'negative_500',
    location: 'channel description',
    placeholder: 'youtube.com/futo_tech',
  },
  {
    name: 'GitHub',
    logo: brandLogo('github'),
    color: 'neutral_600',
    location: 'profile bio',
    placeholder: 'github.com/futo-org',
  },
  {
    name: 'Discord',
    logo: brandLogo('discord'),
    color: 'primary_500',
    location: 'About Me',
    placeholder: 'discord.gg/futo',
  },
  {
    name: 'Hacker News',
    logo: brandLogo('hacker-news'),
    color: 'warning_500',
    location: 'about section',
    placeholder: 'news.ycombinator.com/user?id=futo',
  },
  // FontAwesome6 has no Rumble brand glyph; use a generic play icon.
  {
    name: 'Rumble',
    logo: solidLogo('circle-play'),
    color: 'positive_500',
    location: 'channel description',
    placeholder: 'rumble.com/c/futo',
  },
  {
    name: 'Twitch',
    logo: brandLogo('twitch'),
    color: 'primary_400',
    location: 'bio',
    placeholder: 'twitch.tv/futo',
  },
  {
    name: 'Other',
    logo: solidLogo('ellipsis'),
    color: 'neutral_500',
    location: 'profile',
    placeholder: 'example.com',
    generic: true,
  },
];

// Accepts a profile URL or bare domain: a valid host (FQDN) with an optional
// scheme and path, e.g. "youtube.com/futo-tech" or "https://example.com".
export function isProfileUrl(value: string): boolean {
  const host = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0];
  return /^([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i.test(host);
}

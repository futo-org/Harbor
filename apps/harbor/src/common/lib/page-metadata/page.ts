import { APP_NAME, APP_TAGLINE, HARBOR_APP_URL } from '@/src/common/constants';
import { truncateText } from '@/src/common/util/truncateText';
import type { Metadata } from 'expo-router/server';
import type { PageImage } from './content';

const DESCRIPTION_LENGTH = 200;

const SOCIAL_CARD: PageImage = {
  url: `${HARBOR_APP_URL}/harbor-social-card.png`,
  width: 1200,
  height: 630,
  type: 'image/png',
};

export const APP_DESCRIPTION = `${APP_NAME} is an open social network where your identity, posts and followers belong to you, not to a platform.`;

export type Page = {
  /** Null for the home page, which is titled with the tagline */
  title: string | null;
  description: string;
  /** Canonical path */
  path: string;
  type?: 'website' | 'profile' | 'article';
  image?: PageImage | null;
  imageAlt?: string;
  /** Show the image as a large card. For content images, not avatars */
  largeImage?: boolean;
  noindex?: boolean;
  /** ISO time */
  publishedTime?: string;
  /** Canonical path of the author's profile */
  authorPath?: string;
};

/** Whitespace collapsed to single spaces */
export function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function toDescription(text: string): string {
  return truncateText(singleLine(text), DESCRIPTION_LENGTH);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The tags of a page: title, description, canonical URL, Open Graph and Twitter */
export function toMetadata(page: Page): Metadata {
  // As `usePageTitle` names the tab once the app has loaded
  const title = page.title
    ? `${page.title} / ${APP_NAME}`
    : `${APP_NAME} - ${APP_TAGLINE}`;
  const shareTitle = page.title ?? title;
  const url = HARBOR_APP_URL + page.path;
  const image = page.image ?? SOCIAL_CARD;
  const imageAlt = page.image ? page.imageAlt : APP_NAME;

  return {
    title,
    description: page.description,
    applicationName: APP_NAME,
    alternates: { canonical: url },
    robots: page.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: shareTitle,
      description: page.description,
      url,
      siteName: APP_NAME,
      type: page.type ?? 'website',
      images: { ...image, alt: imageAlt },
      publishedTime: page.publishedTime,
      authors: page.authorPath ? [HARBOR_APP_URL + page.authorPath] : undefined,
    },
    twitter: {
      card: !page.image || page.largeImage ? 'summary_large_image' : 'summary',
      title: shareTitle,
      description: page.description,
      images: { url: image.url, alt: imageAlt },
    },
  };
}

/** For content that is gone, hidden by moderation or could not be loaded */
export function unavailablePage(title: string, path: string): Page {
  return { title, description: APP_DESCRIPTION, path, noindex: true };
}

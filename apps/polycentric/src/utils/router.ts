import type { LinkProps } from 'expo-router';

/**
 * Turns an 'href' prop value into a flattened string with params substituted
 */
export function flattenHref(href?: LinkProps['href']): string | undefined {
  if (!href) return undefined;
  if (typeof href === 'string') return href;

  let path = href.pathname as string;
  const params = href.params as Record<string, string> | undefined;

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      path = path.replace(`[${key}]`, value);
    }
  }

  // Remove route groups like (flat)
  path = path.replace(/\([^)]+\)\//g, '');

  return path;
}

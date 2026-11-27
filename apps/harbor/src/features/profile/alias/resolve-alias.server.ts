import { isIdentityKey } from '@/src/common/util/isIdentityKey';
import { parseAlias } from './helpers';

const MAX_DOCUMENT_LENGTH = 1_000_000;

/**
 * The identity a domain lists for an alias. The server's version of
 * `useAliasResolutionStore`, which fetches from the viewer's browser.
 *
 * The domain comes from the URL. Deployments only let the web server connect
 * to public addresses (a network policy), so this doesn't check where the
 * domain points.
 */
export async function resolveAlias(
  alias: string,
  signal: AbortSignal,
): Promise<string | null> {
  const parsed = parseAlias(alias);
  if (!parsed) return null;

  try {
    const response = await fetch(
      `https://${parsed.domain}/.well-known/polycentric.json`,
      { headers: { accept: 'application/json' }, redirect: 'error', signal },
    );
    if (!response.ok) return null;

    const text = await response.text();
    if (text.length > MAX_DOCUMENT_LENGTH) return null;

    const identity: unknown = JSON.parse(text)?.names?.[parsed.localPart];

    return typeof identity === 'string' && isIdentityKey(identity)
      ? identity.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

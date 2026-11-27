import { cached } from '@/src/common/lib/head/cached.server';
import { type Head, toMetadata, unavailableHead } from '@/src/common/lib/head';
import { routeParam } from '@/src/common/lib/head/route-param.server';
import type { GenerateMetadataFunction } from 'expo-router/server';
import type { Author } from './index';
import { loadAuthor } from './load-author.server';

/** For a post, claim or calendar event: content at /[identityId]/…/[keyFingerprint]/[sequence] */
export function createAuthoredMetadata(
  unavailableTitle: string,
  toPath: (
    identity: string,
    keyFingerprint: string,
    sequence: string,
  ) => string,
  loadHead: (
    author: Author,
    path: string,
    keyFingerprint: string,
    sequence: bigint,
    signal: AbortSignal,
  ) => Promise<Head | null>,
): GenerateMetadataFunction {
  return async (_request, params) => {
    const identityId = routeParam(params, 'identityId');
    const keyFingerprint = routeParam(params, 'keyFingerprint').toLowerCase();
    const sequence = routeParam(params, 'sequence');
    const path = toPath(identityId, keyFingerprint, sequence);

    const head = await cached(path, async (signal) => {
      if (!/^\d{1,19}$/.test(sequence)) return null;

      const author = await loadAuthor(identityId, signal);
      if (!author || author.sensitive) return null;

      return loadHead(
        author,
        toPath(author.identity, keyFingerprint, sequence),
        keyFingerprint,
        BigInt(sequence),
        signal,
      );
    });

    return toMetadata(head ?? unavailableHead(unavailableTitle, path));
  };
}

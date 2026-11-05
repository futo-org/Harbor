import { shortenIdentityId } from '@/src/common/lib/polycentric-hooks';
import { FetchMode } from '@polycentric/react-native';
import { useEffect } from 'react';
import { normalizeAlias } from '../alias/helpers';
import { useAliasResolutionStore } from '../alias/useAliasResolutionStore';
import { useProfile } from './useProfile';

export interface IdentityHandleResult {
  kind: 'loading' | 'alias-pending' | 'alias' | 'hash';
  text: string;
}

export function useIdentityHandle(
  identity: string | null | undefined,
): IdentityHandleResult {
  const profile = useProfile(identity, {
    // Identity without profile events has nothing to cache, and would
    // otherwise never resolve
    fetchMode: FetchMode.OfflineFirst,
  });
  const claimedAlias = profile.alias ? normalizeAlias(profile.alias) : null;

  const resolvedIdentity = useAliasResolutionStore((state) =>
    claimedAlias ? state.identityByAlias[claimedAlias] : undefined,
  );
  const resolveAlias = useAliasResolutionStore((state) => state.resolveAlias);

  useEffect(() => {
    if (claimedAlias) void resolveAlias(claimedAlias);
  }, [claimedAlias, resolveAlias]);

  if (!identity || (!profile.alias && profile.isLoading)) {
    return { kind: 'loading', text: '…' };
  }

  if (claimedAlias && resolvedIdentity === undefined) {
    return { kind: 'alias-pending', text: claimedAlias };
  }

  if (
    claimedAlias &&
    resolvedIdentity?.toLowerCase() === identity.toLowerCase()
  ) {
    return { kind: 'alias', text: claimedAlias };
  }

  return { kind: 'hash', text: shortenIdentityId(identity) };
}

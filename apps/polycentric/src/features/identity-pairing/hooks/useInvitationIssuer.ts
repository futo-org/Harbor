import {
  publicKeyToString,
  stringToPublicKey,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { type ActiveInvitation } from '@polycentric/react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useInvitationIssuer(identityKey: string | null | undefined) {
  const client = usePolycentric();
  const [currentInvitation, setCurrentInvitation] =
    useState<ActiveInvitation | null>(null);
  const [invitationLoading, setInvitationLoading] = useState(false);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [alreadyApprovedOrDeniedClaimers, setHiddenClaimers] = useState<
    Set<string>
  >(new Set());
  const [alreadyAuthorizedClaimers, setAuthorizedClaimers] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    if (!identityKey) return;
    client.identityManager
      .fetchIdentityState(identityKey)
      .then((state) => {
        const next = new Set<string>();
        state.rotationKeys.forEach((k) => next.add(publicKeyToString(k)));
        state.signingKeys.forEach((k) => next.add(publicKeyToString(k)));
        setAuthorizedClaimers(next);
      })
      .catch(() => {});
  }, [client.identityManager, identityKey]);

  const code = currentInvitation?.code ?? null;
  const server = currentInvitation?.server ?? null;
  const expired = currentInvitation?.expired ?? false;

  useEffect(() => {
    if (!code || !server || expired) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const status = await client.invitationManager.getInvitationStatus(
          code,
          server,
        );
        if (cancelled) return;
        setCurrentInvitation((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            claimers: [...status.claimers],
            expired: status.expired,
          };
        });
      } catch {
        if (cancelled) return;
        setCurrentInvitation(null);
        setInvitationError(
          'Pairing failed. Close and reopen Pair Identity to try again.',
        );
      }
    };

    void poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [client.invitationManager, code, server, expired]);

  const pendingClaimers = useMemo<string[]>(() => {
    if (!currentInvitation) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const claimer of currentInvitation.claimers) {
      const claimerStr = publicKeyToString(claimer);
      if (
        seen.has(claimerStr) ||
        alreadyApprovedOrDeniedClaimers.has(claimerStr) ||
        alreadyAuthorizedClaimers.has(claimerStr)
      ) {
        continue;
      }
      seen.add(claimerStr);
      result.push(claimerStr);
    }
    return result;
  }, [
    currentInvitation,
    alreadyApprovedOrDeniedClaimers,
    alreadyAuthorizedClaimers,
  ]);

  const createInvitation = useCallback(async () => {
    if (!identityKey) return;
    setInvitationLoading(true);
    setInvitationError(null);
    try {
      const currentKey = client.currentKeyPair?.publicKey;
      if (!currentKey) throw new Error('No active key pair');
      const isRotationKey =
        await client.identityManager.isRotationKeyForIdentity(
          identityKey,
          currentKey,
        );
      if (!isRotationKey) {
        throw new Error('Only rotation key holders can create invitations');
      }
      const invitation =
        await client.invitationManager.createInvitation(identityKey);
      setCurrentInvitation(invitation);
      setHiddenClaimers(new Set());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create invitation';
      setInvitationError(message);
    } finally {
      setInvitationLoading(false);
    }
  }, [client, identityKey]);

  const clearInvitation = useCallback(() => {
    setCurrentInvitation(null);
    setInvitationError(null);
    setHiddenClaimers(new Set());
  }, []);

  const denyClaimer = useCallback((claimerStr: string) => {
    setHiddenClaimers((prev) => new Set([...prev, claimerStr]));
  }, []);

  const approveClaimer = useCallback(
    async (claimerStr: string, asRotationKey: boolean) => {
      if (!identityKey) return;
      setHiddenClaimers((prev) => new Set([...prev, claimerStr]));
      try {
        const claimer = stringToPublicKey(claimerStr);
        if (asRotationKey) {
          await client.identityManager.addRotationKey(identityKey, claimer);
        } else {
          await client.identityManager.addSigningKey(identityKey, claimer);
        }
        await client.push();
      } catch (err) {
        setHiddenClaimers((prev) => {
          const next = new Set(prev);
          next.delete(claimerStr);
          return next;
        });
        throw err;
      }
    },
    [client, identityKey],
  );

  return {
    currentInvitation,
    pendingClaimers,
    invitationError,
    invitationLoading,
    createInvitation,
    clearInvitation,
    denyClaimer,
    approveClaimer,
  };
}

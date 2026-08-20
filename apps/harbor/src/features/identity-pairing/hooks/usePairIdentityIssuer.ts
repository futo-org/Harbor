import {
  publicKeyToString,
  stringToPublicKey,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import type { ActivePairingSession } from '@polycentric/react-native';
import { SyncStrategy } from '@polycentric/react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function usePairIdentityIssuer(identityKey: string | null | undefined) {
  const client = usePolycentric();
  const [currentPairingSession, setCurrentPairingSession] =
    useState<ActivePairingSession | null>(null);
  const [pairingSessionLoading, setPairingSessionLoading] = useState(false);
  const [pairingSessionError, setPairingSessionError] = useState<string | null>(
    null,
  );
  const [alreadyApprovedOrDeniedClaimers, setHiddenClaimers] = useState<
    Set<string>
  >(new Set());
  const [alreadyAuthorizedClaimers, setAuthorizedClaimers] = useState<
    Set<string>
  >(new Set());

  // Update the list of already-authorized keys from *local* state.
  const refreshAuthorizedClaimers = useCallback(async () => {
    if (!identityKey) return;
    const state = client.identityManager.resolveIdentity(identityKey);
    if (!state) return;

    const next = new Set<string>();
    state.rotationKeys.forEach((k) => {
      next.add(publicKeyToString(k));
    });
    state.signingKeys.forEach((k) => {
      next.add(publicKeyToString(k));
    });
    setAuthorizedClaimers(next);
  }, [client.identityManager, identityKey]);

  useEffect(() => {
    void refreshAuthorizedClaimers().catch(() => {});
  }, [refreshAuthorizedClaimers]);

  const code = currentPairingSession?.code ?? null;
  const server = currentPairingSession?.server ?? null;

  // Keep pairing session state up-to-date
  useEffect(() => {
    if (!code || !server) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const status =
          await client.pairingSessionManager.getPairingSessionStatus(
            code,
            server,
          );
        if (cancelled) return;
        setCurrentPairingSession((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            claimers: [...status.claimers],
          };
        });
      } catch {
        if (cancelled) return;
        setCurrentPairingSession(null);
        setPairingSessionError(
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
  }, [client.pairingSessionManager, code, server]);

  const pendingClaimers = useMemo<string[]>(() => {
    if (!currentPairingSession) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const claimer of currentPairingSession.claimers) {
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
    currentPairingSession,
    alreadyApprovedOrDeniedClaimers,
    alreadyAuthorizedClaimers,
  ]);

  const createPairingSession = useCallback(async () => {
    if (!identityKey) return;
    setPairingSessionLoading(true);
    setPairingSessionError(null);
    try {
      const currentKey = client.currentKeyPair?.publicKey;
      if (!currentKey) throw new Error('No active key pair');

      // Pull latest identity state
      await client.sync(SyncStrategy.PARTIAL_PULL);
      await refreshAuthorizedClaimers();

      const isRotationKey = client.identityManager.isRotationKeyForIdentity(
        identityKey,
        currentKey,
      );
      if (!isRotationKey) {
        throw new Error(
          'Only rotation key holders can create pairing sessions',
        );
      }
      const targetServer = client.servers[0];
      if (!targetServer) throw new Error('No servers configured');
      const pairingSession =
        await client.pairingSessionManager.createPairingSessionOnServer(
          identityKey,
          targetServer,
        );

      if (pairingSession.identityKey !== identityKey) {
        throw new Error(
          "Server's pairing session does not match current identity.",
        );
      }

      setCurrentPairingSession(pairingSession);
      setHiddenClaimers(new Set());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create pairing session';
      setPairingSessionError(message);
    } finally {
      setPairingSessionLoading(false);
    }
  }, [client, identityKey, refreshAuthorizedClaimers]);

  const clearPairingSession = useCallback(() => {
    setCurrentPairingSession(null);
    setPairingSessionError(null);
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
          await client.identityManager.addRotationKey(claimer);
        } else {
          await client.identityManager.addSigningKey(claimer);
        }
        // Update local hook state to include the new key
        await refreshAuthorizedClaimers();
      } catch (err) {
        setHiddenClaimers((prev) => {
          const next = new Set(prev);
          next.delete(claimerStr);
          return next;
        });
        throw err;
      }
    },
    [client, identityKey, refreshAuthorizedClaimers],
  );

  return {
    currentPairingSession,
    pendingClaimers,
    pairingSessionError,
    pairingSessionLoading,
    createPairingSession,
    clearPairingSession,
    denyClaimer,
    approveClaimer,
  };
}

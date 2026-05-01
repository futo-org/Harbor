import {
  publicKeyToString,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { useEffect, useState } from 'react';

interface UsePairIdentityClaimerOptions {
  pairingSessionCode?: string;
  pairingSessionServer?: string;
}

export function usePairIdentityClaimer(
  options?: UsePairIdentityClaimerOptions,
) {
  const client = usePolycentric();
  const pairingSessionCode = options?.pairingSessionCode;
  const pairingSessionServer = options?.pairingSessionServer;
  const [identityKey, setIdentityKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [claimInProgress, setClaimInProgress] = useState(false);

  useEffect(() => {
    if (!pairingSessionCode || identityKey) return;

    const claimAndWait = async () => {
      setClaimInProgress(true);
      try {
        if (!pairingSessionServer) {
          throw new Error('Pairing session server is required.');
        }

        const status = await client.pairingSessionManager.joinPairingSession(
          pairingSessionCode,
          pairingSessionServer,
        );
        const pairingSession = status.pairingSession;
        if (!pairingSession) {
          throw new Error('Pairing session not found or expired.');
        }
        setIdentityKey(pairingSession.issuerIdentity);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to join pairing session';
        setError(errorMessage);
      } finally {
        setClaimInProgress(false);
      }
    };

    claimAndWait();
  }, [pairingSessionCode, pairingSessionServer, identityKey, client]);

  useEffect(() => {
    if (!identityKey || !pairingSessionServer) return;

    let cancelled = false;

    const pollApproval = async () => {
      try {
        const state = await client.identityManager.fetchIdentityState(
          identityKey,
          pairingSessionServer,
        );
        const currentKey = client.currentKeyPair?.publicKey;

        if (!currentKey || cancelled) return;

        const authorized = new Set<string>();
        state.rotationKeys.forEach((k) => authorized.add(publicKeyToString(k)));
        state.signingKeys.forEach((k) => authorized.add(publicKeyToString(k)));

        if (authorized.has(publicKeyToString(currentKey))) {
          // add the pairing session server to our servers list
          if (!client.servers.includes(pairingSessionServer)) {
            client.servers.push(pairingSessionServer);
          }

          // fetch and apply the identity document
          await client.identityManager.claim(identityKey);

          setApproved(true);
        }
      } catch {
        // polling failed, will retry on next interval
      }
    };

    void pollApproval();
    const interval = setInterval(() => {
      void pollApproval();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [identityKey, pairingSessionServer, client]);

  return {
    error,
    approved,
    claimInProgress,
  };
}

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
  const [authorized, setAuthorized] = useState(false);
  const [approved, setApproved] = useState(false);
  const [claimInProgress, setClaimInProgress] = useState(false);

  // Join the pairing session on the server and learn the issuer identity.
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

  // Poll the issuer's identity until the current key is authorized.
  // Stops once `authorized` flips to true.
  useEffect(() => {
    if (!identityKey || !pairingSessionServer || authorized) return;

    let cancelled = false;

    const pollAuthorization = async () => {
      try {
        const state = await client.identityManager.fetchIdentityState(
          identityKey,
          pairingSessionServer,
        );
        if (cancelled) return;
        const currentKey = client.currentKeyPair?.publicKey;
        if (!currentKey) return;

        const keys = new Set<string>();
        state.rotationKeys.forEach((k) => {
          keys.add(publicKeyToString(k));
        });
        state.signingKeys.forEach((k) => {
          keys.add(publicKeyToString(k));
        });

        if (keys.has(publicKeyToString(currentKey))) {
          setAuthorized(true);
        }
      } catch {
        // polling failed, will retry on next interval
      }
    };

    void pollAuthorization();
    const interval = setInterval(() => {
      void pollAuthorization();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [identityKey, pairingSessionServer, client, authorized]);

  // Claim exactly once when authorization is observed.
  useEffect(() => {
    if (!authorized || !identityKey || !pairingSessionServer) return;

    let cancelled = false;

    void (async () => {
      try {
        if (!client.servers.includes(pairingSessionServer)) {
          client.servers.push(pairingSessionServer);
        }
        await client.identityManager.claim(identityKey);
        if (!cancelled) setApproved(true);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to claim identity';
          setError(message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorized, identityKey, pairingSessionServer, client]);

  return {
    error,
    approved,
    claimInProgress,
  };
}

import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { useEffect, useState } from 'react';
import { publicKeyToString } from '@polycentric/react-native';

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
  const [claimerKeyStr, setClaimerKeyStr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairingAuthorized, setPairingAuthorized] = useState(false);
  const [claimInProgress, setClaimInProgress] = useState(false);
  const [authorizedRole, setAuthorizedRole] = useState<
    'rotation' | 'signing' | null
  >(null);

  // Join the pairing session on the server and learn the issuer identity.
  // startPairingSession generates an in-memory key for this identity and signs the
  // join with it - nothing is persisted until pairing completes.
  useEffect(() => {
    if (!pairingSessionCode || identityKey) return;

    const claimAndWait = async () => {
      setClaimInProgress(true);
      try {
        if (!pairingSessionServer) {
          throw new Error('Pairing session server is required.');
        }

        const status = await client.pairingSessionManager.startPairingSession(
          pairingSessionCode,
          pairingSessionServer,
        );
        const pairingSession = status.pairingSession;
        if (!pairingSession) {
          throw new Error('Pairing session not found or expired.');
        }
        setIdentityKey(pairingSession.issuerIdentity);
        const claimerKey = client.pairingSessionManager.pendingClaimKey;
        if (claimerKey) setClaimerKeyStr(publicKeyToString(claimerKey));
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
  // Stops once `authorizedRole` is set.
  useEffect(() => {
    if (!identityKey || !pairingSessionServer || authorizedRole) return;

    let cancelled = false;

    const pollAuthorization = async () => {
      try {
        const role =
          await client.pairingSessionManager.checkPairingAuthorization(
            pairingSessionServer,
          );
        if (role && !cancelled) {
          setAuthorizedRole(role);
          setPairingAuthorized(true);
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
  }, [identityKey, pairingSessionServer, client, authorizedRole]);

  return {
    error,
    pairingAuthorized,
    claimInProgress,
    claimerKeyStr,
    authorizedRole,
  };
}

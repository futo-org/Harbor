import { useState, useEffect } from 'react';
import {
  publicKeyToString,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';

interface UseInvitationClaimerOptions {
  inviteCode?: string;
  inviteServer?: string;
}

export function useInvitationClaimer(options?: UseInvitationClaimerOptions) {
  const client = usePolycentric();
  const inviteCode = options?.inviteCode;
  const inviteServer = options?.inviteServer;
  const [identityKey, setIdentityKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [claimInProgress, setClaimInProgress] = useState(false);

  useEffect(() => {
    if (!inviteCode || identityKey) return;

    const claimAndWait = async () => {
      setClaimInProgress(true);
      try {
        if (!inviteServer) {
          throw new Error('Invitation server is required.');
        }

        const status = await client.invitationManager.claimInvitation(
          inviteCode,
          inviteServer,
        );
        const invitation = status.invitation;
        if (!invitation) {
          throw new Error('Invitation not found or expired.');
        }
        setIdentityKey(invitation.identity);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to claim invitation';
        setError(errorMessage);
      } finally {
        setClaimInProgress(false);
      }
    };

    claimAndWait();
  }, [inviteCode, inviteServer, identityKey, client]);

  useEffect(() => {
    if (!identityKey || !inviteServer) return;

    let cancelled = false;

    const pollApproval = async () => {
      try {
        const state = await client.identityManager.fetchIdentityState(
          identityKey,
          inviteServer,
        );
        const currentKey = client.currentKeyPair?.publicKey;

        if (!currentKey || cancelled) return;

        const authorized = new Set<string>();
        state.rotationKeys.forEach((k) => authorized.add(publicKeyToString(k)));
        state.signingKeys.forEach((k) => authorized.add(publicKeyToString(k)));

        if (authorized.has(publicKeyToString(currentKey))) {
          if (!client.servers.includes(inviteServer)) {
            client.servers.push(inviteServer);
          }
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
  }, [identityKey, inviteServer, client]);

  return {
    error,
    approved,
    claimInProgress,
  };
}

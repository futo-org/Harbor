import {
  publicKeyToString,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { useEffect, useState } from 'react';
import type { PairingSessionInfo } from '../pairingCode';

export type PairIdentityClaimerHookResult = {
  error: string | null;
  approved: boolean;
  claimInProgress: boolean;
};

/** `useEffect()` return type */
type StageResult = (() => void) | undefined;

type ErrorState = { message: string };
type JoiningState = { sessionInfo: PairingSessionInfo };
type PollingState = JoiningState;
type ClaimingState = PollingState;

type ClaimerState =
  | { stage: 'unstarted' }
  | ({ stage: 'error' } & ErrorState)
  | ({ stage: 'joining' } & JoiningState)
  | ({ stage: 'polling' } & PollingState)
  | ({ stage: 'claiming' } & ClaimingState)
  | { stage: 'done' };

export function usePairIdentityClaimer(
  sessionInfo: PairingSessionInfo | null | undefined,
): PairIdentityClaimerHookResult {
  const client = usePolycentric();
  const [state, setState] = useState<ClaimerState>({ stage: 'unstarted' });

  useEffect(() => {
    const error = (message: string): void => {
      setState({ stage: 'error', message });
    };

    // ---  Define handlers for each stage ---
    const whenUnstarted = (): StageResult => {
      if (sessionInfo) {
        setState({ stage: 'joining', sessionInfo });
      } else if (sessionInfo === null) {
        error('Invalid pairing code.');
      }

      return undefined;
    };

    const whenError = (): StageResult => {
      if (sessionInfo === undefined) {
        setState({ stage: 'unstarted' });
      }

      return undefined;
    };

    const whenJoining = ({ sessionInfo }: JoiningState): StageResult => {
      let cancelled = false;

      const claimAndWait = async () => {
        try {
          const status = await client.pairingSessionManager.joinPairingSession(
            sessionInfo.code,
            sessionInfo.origin,
          );

          if (cancelled) return;
          if (status.pairingSession.issuerIdentity !== sessionInfo.identity) {
            return error(
              "Pairing session identity does not match issuer's identity.",
            );
          }

          setState({ stage: 'polling', sessionInfo });
        } catch (err) {
          if (cancelled) return;

          const message =
            err instanceof Error
              ? err.message
              : 'Failed to join pairing session.';

          setState({ stage: 'error', message });
        }
      };

      claimAndWait();
      return () => {
        cancelled = true;
      };
    };

    const whenPolling = ({ sessionInfo }: PollingState): StageResult => {
      let cancelled = false;

      const pollAuthorization = async () => {
        try {
          const state = await client.identityManager.fetchIdentityState(
            sessionInfo.identity,
            sessionInfo.origin,
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
            setState({ stage: 'claiming', sessionInfo });
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
    };

    const whenClaiming = ({ sessionInfo }: ClaimingState): StageResult => {
      const server = sessionInfo.origin;
      let cancelled = false;

      void (async () => {
        try {
          if (!client.servers.includes(server)) {
            client.servers.push(server);
          }
          await client.identityManager.claim(sessionInfo.identity);
          if (!cancelled) setState({ stage: 'done' });
        } catch (err) {
          if (!cancelled) {
            const message =
              err instanceof Error ? err.message : 'Failed to claim identity';
            setState({ stage: 'error', message });
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    };

    // Run the correct handler
    switch (state.stage) {
      case 'unstarted':
        return whenUnstarted();
      case 'error':
        return whenError();
      case 'joining':
        return whenJoining(state);
      case 'polling':
        return whenPolling(state);
      case 'claiming':
        return whenClaiming(state);
      case 'done':
        return;
    }
  }, [sessionInfo, state, client]);

  // Derive return value
  return {
    error: state.stage === 'error' ? state.message : null,
    approved: state.stage === 'done',
    claimInProgress: state.stage === 'joining',
  };
}

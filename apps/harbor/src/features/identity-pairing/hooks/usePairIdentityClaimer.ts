import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import {
  COLLECTION,
  type PairingSession,
  type v2,
} from '@polycentric/react-native';
import { useEffect, useState } from 'react';

export type PairIdentityClaimerHookResult = {
  error: string | null;
  approved: boolean;
  claimInProgress: boolean;
};

/** `useEffect()` return type */
type StageResult = (() => void) | undefined;

type ErrorState = { message: string };
type JoiningState = { info: v2.PairingInfo };
type PollingState = JoiningState & { session: PairingSession };
type ClaimingState = PollingState;

type ClaimerState =
  | { stage: 'unstarted' }
  | ({ stage: 'error' } & ErrorState)
  | ({ stage: 'joining' } & JoiningState)
  | ({ stage: 'polling' } & PollingState)
  | ({ stage: 'claiming' } & ClaimingState)
  | { stage: 'done' };

export function usePairIdentityClaimer(
  info: v2.PairingInfo | null | undefined,
): PairIdentityClaimerHookResult {
  const client = usePolycentric();
  const [state, setState] = useState<ClaimerState>({ stage: 'unstarted' });

  useEffect(() => {
    const error = (message: string): void => {
      setState({ stage: 'error', message });
    };

    // ---  Define handlers for each stage ---
    const whenUnstarted = (): StageResult => {
      if (info) {
        setState({ stage: 'joining', info });
      } else if (info === null) {
        error('Invalid pairing code.');
      }

      return undefined;
    };

    const whenError = (): StageResult => {
      if (info === undefined) {
        setState({ stage: 'unstarted' });
      }

      return undefined;
    };

    const whenJoining = ({ info }: JoiningState): StageResult => {
      let canceled = false;

      const join = async () => {
        try {
          const session =
            await client.pairingSessionManager.getPairingSession(info);
          if (canceled) return;

          // TODO: handle servers more robustly
          if (!client.servers.includes(info.server)) {
            client.servers = [...client.servers, info.server];
            client.core.setServers(client.servers);
          }

          await client.listEvents({
            identity: session.digest.issuerIdentity,
            collection: COLLECTION.IDENTITY,
          });
          if (canceled) return;

          await client.pairingSessionManager.joinPairingSession(info);
          if (canceled) return;

          setState({ stage: 'polling', info, session });
        } catch (err) {
          if (canceled) return;

          const message =
            err instanceof Error
              ? err.message
              : 'Failed to join pairing session.';

          setState({ stage: 'error', message });
        }
      };

      join();
      return () => {
        canceled = true;
      };
    };

    const whenPolling = ({ info, session }: PollingState): StageResult => {
      let canceled = false;

      // Poll until we get a different marker and then try claiming
      const pollForRemoteChange = async () => {
        try {
          const isAuthorized =
            await client.pairingSessionManager.pollForAuthorization(info);

          if (canceled || !isAuthorized) return;

          setState({ stage: 'claiming', info, session });
        } catch (e) {
          // polling failed, will retry on next interval
          console.warn(`pairing session polling error: ${e}`);
        }
      };

      void pollForRemoteChange();
      const interval = setInterval(() => {
        void pollForRemoteChange();
      }, 2000);

      return () => {
        canceled = true;
        clearInterval(interval);
      };
    };

    const whenClaiming = ({ session }: ClaimingState): StageResult => {
      let canceled = false;

      void (async () => {
        try {
          const identityKey = session.digest.issuerIdentity;
          const identityState = await client.identityManager.claim(identityKey);
          if (canceled) return;

          if (identityState) {
            setState({ stage: 'done' });
          } else {
            setState({ stage: 'error', message: 'Failed to claim identity' });
          }
        } catch (err) {
          if (!canceled) {
            const message =
              err instanceof Error ? err.message : 'Failed to claim identity';
            setState({ stage: 'error', message });
          }
        }
      })();

      return () => {
        canceled = true;
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
  }, [info, state, client]);

  // Derive return value
  return {
    error: state.stage === 'error' ? state.message : null,
    approved: state.stage === 'done',
    claimInProgress: state.stage === 'joining',
  };
}

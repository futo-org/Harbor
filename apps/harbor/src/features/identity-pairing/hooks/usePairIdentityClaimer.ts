import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { decodeBundle } from '@/src/common/lib/polycentric-hooks/helpers';
import { redirectIfLoggedIn } from '@/src/features/onboarding/redirectIfLoggedIn';
import type { PairingSession, v2 } from '@polycentric/react-native';
import { useCallback, useEffect, useState } from 'react';

export type PairIdentityClaimerHookResult = {
  stage: ClaimerStage;
  error: string | null;
  issuerIdentity: string | undefined;
  approved: boolean;
  join: () => void;
};

export type ClaimerStage = ClaimerState['stage'];

/** `useEffect()` return type */
type StageResult = (() => void) | undefined;

type ErrorState = { message: string };

type ConfirmingState = {
  info: v2.PairingInfo;
  session: PairingSession | undefined;
};

type JoiningState = {
  info: v2.PairingInfo;
  session: PairingSession | undefined;
};

type PollingState = { info: v2.PairingInfo; session: PairingSession };
type ClaimingState = PollingState;

type ClaimerState =
  | { stage: 'unstarted' }
  | ({ stage: 'error' } & ErrorState)
  | ({ stage: 'confirming' } & ConfirmingState)
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

    const onError = (e: unknown, fallback?: string): void => {
      if (e instanceof Error) {
        error(e.message);
      } else if (fallback) {
        error(fallback);
      } else {
        error('Pairing failed.');
      }
    };

    // ---  Define handlers for each stage ---
    const whenUnstarted = (): StageResult => {
      if (info) {
        setState({ stage: 'confirming', info, session: undefined });
      } else if (info === null) {
        error('Invalid pairing link.');
      }

      return undefined;
    };

    const whenError = (): StageResult => {
      if (info === undefined) {
        setState({ stage: 'unstarted' });
      }

      return undefined;
    };

    const whenConfirming = ({
      info,
      session,
    }: ConfirmingState): StageResult => {
      if (session) return undefined;

      let canceled = false;

      const fetchSession = async () => {
        try {
          const session =
            await client.pairingSessionManager.getPairingSession(info);
          if (canceled) return;

          setState((prev) =>
            prev.stage === 'confirming' ? { ...prev, session } : prev,
          );
        } catch (err) {
          if (canceled) return;
          onError(err, 'Failed to fetch pairing session.');
        }
      };

      fetchSession();
      return () => {
        canceled = true;
      };
    };

    const whenJoining = ({ info, session }: JoiningState): StageResult => {
      let canceled = false;

      const join = async () => {
        try {
          const resolved =
            session ??
            (await client.pairingSessionManager.getPairingSession(info));
          if (canceled) return;

          await client.pairingSessionManager.joinPairingSession(info);
          if (canceled) return;

          setState({ stage: 'polling', info, session: resolved });
        } catch (err) {
          if (canceled) return;
          onError(err, 'Failed to join pairing session.');
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

    const whenClaiming = ({ info, session }: ClaimingState): StageResult => {
      let canceled = false;

      void (async () => {
        try {
          // Bail if the user was logged in elsewhere during the pairing process
          if (await redirectIfLoggedIn(client)) return;
          if (canceled) return;

          const identityKey = session.digest.issuerIdentity;
          const claimServers = serversForClaim(session, info, client.servers);
          await client.identityManager.claim(identityKey, claimServers);
          if (canceled) return;

          setState({ stage: 'done' });
        } catch (err) {
          if (!canceled) {
            onError(err, 'Failed to claim identity');
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
      case 'confirming':
        return whenConfirming(state);
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

  const join = useCallback(() => {
    setState((prev) => {
      if (prev.stage === 'confirming') {
        return { stage: 'joining', info: prev.info, session: prev.session };
      } else {
        return prev;
      }
    });
  }, []);

  let issuerIdentity: string | undefined;
  if ('session' in state) {
    issuerIdentity = state.session?.digest.issuerIdentity;
  }

  // Derive return value
  return {
    error: state.stage === 'error' ? state.message : null,
    approved: state.stage === 'done',
    stage: state.stage,
    issuerIdentity,
    join,
  };
}

/** Servers to query identity events from while claiming the paired identity. */
function serversForClaim(
  session: PairingSession,
  info: v2.PairingInfo,
  currentServers: string[],
): string[] {
  const bundle = session.issuerState.identityState;
  if (!bundle) {
    throw new Error('Pairing session has no issuer identity state.');
  }

  const decoded = decodeBundle(bundle, 'identity');
  if (!decoded) {
    throw new Error('Pairing session issuer identity state is invalid.');
  }

  const declared = decoded.content.servers;
  if (declared) return declared.urls;

  return [...new Set([...currentServers, info.server])];
}

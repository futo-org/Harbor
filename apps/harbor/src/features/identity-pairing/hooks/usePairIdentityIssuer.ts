import {
  publicKeyToString,
  stringToPublicKey,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import type { PairingSession, v2 } from '@polycentric/react-native';
import { SyncStrategy } from '@polycentric/react-native';
import { useEffect, useRef, useState } from 'react';

export type PairIdentityIssuerHookResult = {
  /** Our view of the pairing session. */
  session: PairingSession | null;

  /**
   * Append-only claimer array managed by us.
   * Having this mirror prevents a server from messing with our view of pre-
   * existing claimers.
   */
  claimers: string[];

  /**
   * Contains the error message for a non-recoverable error, if any.
   * When non-null, an error page should be displayed instead of continuing with
   * the pairing process.
   */
  error: string | null;

  /** Indicates which stage of the pairing process we are on. */
  stage: IssuerState['stage'];

  /**
   * Create a new pairing session.
   * `session` will be non-null when the session is ready to be displayed.
   */
  createSession: () => void;

  /**
   * Approve a claimer to be added to the active identity.
   */
  approveClaimer: (claimer: string, asRotation: boolean) => void;
};

type ErrorState = { message: string };
type PollingState = { session: PairingSession; claimers: string[] };
type ApprovingState = PollingState & { approvedClaimer: string };
type DoneState = ApprovingState;

type IssuerState =
  | { stage: 'unstarted' }
  | ({ stage: 'error' } & ErrorState)
  | { stage: 'creating' }
  | ({ stage: 'polling' } & PollingState)
  | ({ stage: 'approving' } & ApprovingState)
  | ({ stage: 'done' } & DoneState);

export function usePairIdentityIssuer(): PairIdentityIssuerHookResult {
  const client = usePolycentric();

  const [state, setState] = useState<IssuerState>({ stage: 'unstarted' });

  // Indicates to handlers that they should stop
  const canceledRef = useRef(false);
  useEffect(() => {
    return () => {
      canceledRef.current = true;
    };
  }, []);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Latest pairing session state sequence
  const pairingSequenceRef = useRef<number>(0);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  /**
   * Poll for claimers once.
   * This should be called on an interval and wrapped to handle errors.
   */
  const poll = async (info: v2.PairingInfo) => {
    if (canceledRef.current && pollIntervalRef.current) {
      stopPolling();
      return;
    }

    const latestClaimers =
      await client.pairingSessionManager.pollForClaimers(info);
    if (canceledRef.current) return;

    setState((state) => {
      if (state.stage !== 'polling') return state;

      const claimers = updateClaimers(state.claimers, latestClaimers);
      return { ...state, claimers };
    });
  };

  const createAndWatchSession = async () => {
    const server = client.servers.at(0);
    if (!server) {
      throw new Error('No servers configured');
    }

    setState({ stage: 'creating' });

    const session =
      await client.pairingSessionManager.createPairingSession(server);
    pairingSequenceRef.current = 1;
    if (canceledRef.current) return;

    setState({ stage: 'polling', session, claimers: [] });
    pollIntervalRef.current = setInterval(() => {
      poll(session.pairingInfo).catch(() => {
        // TODO: use setter and have real message
        setState({ stage: 'error', message: 'TODO' });
      });
    }, 2000);
  };

  const approve = async (claimer: string, asRotation: boolean) => {
    if (state.stage !== 'polling') return;

    setState((state) => {
      if (state.stage !== 'polling') return state;
      return { ...state, stage: 'approving', approvedClaimer: claimer };
    });

    await client.sync(SyncStrategy.PARTIAL_PULL);
    if (canceledRef.current) return;

    const key = stringToPublicKey(claimer);
    if (asRotation) {
      await client.identityManager.addRotationKey(key);
    } else {
      await client.identityManager.addSigningKey(key);
    }

    const server = state.session.pairingInfo.server;
    pairingSequenceRef.current++;
    await client.pairingSessionManager.updatePairingSession(
      server,
      state.session.digestBytes,
      BigInt(pairingSequenceRef.current),
    );

    if (canceledRef.current) return;

    stopPolling();
    setState((state) => {
      if (state.stage !== 'approving') return state;
      return { ...state, stage: 'done' };
    });
  };

  // Derive return value
  const stage = state.stage;
  const error = stage === 'error' ? state.message : null;

  let session = null;
  let claimers: string[] = [];

  if (stage === 'polling' || stage === 'approving' || stage === 'done') {
    session = state.session;
    claimers = state.claimers;
  }

  return {
    stage,
    error,
    session,
    claimers,
    createSession: () => {
      createAndWatchSession().catch(() => {
        setState({ stage: 'error', message: 'TODO' });
      });
    },
    approveClaimer: (claimer, asRotation) => {
      approve(claimer, asRotation).catch(() => {
        setState({ stage: 'error', message: 'TODO' });
      });
    },
  };
}

/** Derive the next value for the claimers array */
function updateClaimers(prev: string[], candidates: v2.PublicKey[]): string[] {
  const next = [...prev];
  const seen = new Set(prev);

  for (const candidate of candidates) {
    const claimer = publicKeyToString(candidate);
    if (!seen.has(claimer)) {
      next.push(claimer);
    }
  }

  return next;
}

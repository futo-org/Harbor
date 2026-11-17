import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks';
import { isWeb } from '@/src/common/util/platform';
import { extractPairingInfo } from '@/src/features/identity-pairing/pairingCode';
import type { v2 } from '@polycentric/react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  LOGIN_CANCEL_MESSAGE,
  LOGIN_READY_MESSAGE,
  LOGIN_REQUEST_MESSAGE,
  LOGIN_SESSION_MESSAGE,
} from '../../lib/login-messages';
import { isFromExtension } from '../lib/extension-origin';

/** Asks the Harbor tab for a pairing session to sign the extension in. */
export function useExtensionLogin(pageUrl: string | undefined) {
  const { currentIdentity, isLoading, isReady } = usePolycentricContext();
  const signedOut = isReady && !isLoading && !currentIdentity;
  const [session, setSession] = useState<v2.PairingInfo>();

  // Asked on every page change: the extension only passes it to a Harbor tab.
  // Not again after a cancel, until the page changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pageUrl re-asks
  useEffect(() => {
    if (!isWeb || window.parent === window || !signedOut) return;
    window.parent.postMessage({ type: LOGIN_REQUEST_MESSAGE }, '*');
  }, [signedOut, pageUrl]);

  useEffect(() => {
    if (!isWeb || window.parent === window || !signedOut) return;
    const onMessage = (event: MessageEvent) => {
      if (!isFromExtension(event)) return;
      // The first request can reach a tab that is still loading.
      if (event.data?.type === LOGIN_READY_MESSAGE) {
        window.parent.postMessage({ type: LOGIN_REQUEST_MESSAGE }, '*');
      }
      if (event.data?.type === LOGIN_CANCEL_MESSAGE) setSession(undefined);
      if (event.data?.type !== LOGIN_SESSION_MESSAGE) return;
      const info = extractPairingInfo(String(event.data.code));
      if (info) setSession((current) => current ?? info);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [signedOut]);

  return {
    session: signedOut ? session : undefined,
    cancel: useCallback(() => {
      setSession(undefined);
      // The Harbor tab stops offering to approve the key this dropped.
      window.parent.postMessage({ type: LOGIN_CANCEL_MESSAGE }, '*');
    }, []),
  };
}

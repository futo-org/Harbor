import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import {
  IdentityManager,
  bytesToHex,
  createServerJwt,
} from '@polycentric/react-native';
import { useEffect } from 'react';
import {
  setTelemetryAuthTokenProvider,
  setTelemetryIdentity,
} from './lib/identity';

/** Mirrors the active identity into the telemetry layer, which runs outside React. */
export function TelemetryIdentitySync() {
  const client = usePolycentric();
  const { identityKey } = useCurrentIdentity();

  useEffect(() => {
    setTelemetryAuthTokenProvider(async (audience) => {
      const keyPair = client.currentKeyPair;
      const iss = client.activeIdentityKey;
      if (!keyPair || !iss) return null;
      return createServerJwt({ keyPair, iss, aud: audience });
    });
    return () => setTelemetryAuthTokenProvider(null);
  }, [client]);

  useEffect(() => {
    const publicKey = client.currentKeyPair?.publicKey;
    const state = identityKey ? client.identityManager.resolveIdentity() : null;
    const canRotate =
      !!publicKey &&
      !!state?.rotationKeys.some((k) =>
        IdentityManager.keysEqual(k, publicKey),
      );
    const canSign =
      canRotate ||
      (!!publicKey &&
        !!state?.signingKeys.some((k) =>
          IdentityManager.keysEqual(k, publicKey),
        ));
    setTelemetryIdentity({
      identityKey,
      signingKey: publicKey ? bytesToHex(publicKey.key) : null,
      canSign,
      canRotate,
    });
  }, [client, identityKey]);

  return null;
}

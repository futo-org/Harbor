import {
  useCurrentIdentity,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { findAuthorization } from '@/src/common/lib/polycentric-hooks/useCurrentAuthorization';
import { bytesToHex } from '@/src/common/lib/polycentric-hooks/helpers';
import { useEffect } from 'react';
import {
  setTelemetryAuthTokenProvider,
  setTelemetryIdentity,
} from './lib/identity';

/** Mirrors the active identity into the telemetry layer, which runs outside React. */
export function TelemetryIdentitySync() {
  const client = usePolycentric();
  const { identityKey, identity } = useCurrentIdentity();

  useEffect(() => {
    setTelemetryAuthTokenProvider(async (audience) => {
      if (!client.activeIdentityKey) return null;
      return client.createServerJwt(audience).catch(() => null);
    });
    return () => setTelemetryAuthTokenProvider(null);
  }, [client]);

  const publicKey = client.activePublicKey;
  useEffect(() => {
    const { canSign, canRotate } = findAuthorization(
      identityKey ? identity : null,
      publicKey,
    );
    setTelemetryIdentity({
      identityKey,
      signingKey: publicKey ? bytesToHex(publicKey.key) : null,
      canSign,
      canRotate,
    });
  }, [identityKey, identity, publicKey]);

  return null;
}

import type { Attributes } from '@opentelemetry/api';
import { useTelemetrySettings } from '../hooks/useTelemetrySettings';

export interface TelemetryIdentity {
  /** Public identity key. */
  identityKey: string | null;
  /** Hex of this device's public signing key. Never the private key. */
  signingKey: string | null;
  canSign: boolean;
  canRotate: boolean;
}

const NONE: TelemetryIdentity = {
  identityKey: null,
  signingKey: null,
  canSign: false,
  canRotate: false,
};

let current: TelemetryIdentity = NONE;
const listeners = new Set<() => void>();

/** Mints a bearer token for `audience` as the active identity, or null. */
export type AuthTokenProvider = (audience: string) => Promise<string | null>;

let authTokenProvider: AuthTokenProvider | null = null;

export function setTelemetryAuthTokenProvider(
  provider: AuthTokenProvider | null,
): void {
  authTokenProvider = provider;
}

export function telemetryAuthToken(audience: string): Promise<string | null> {
  return authTokenProvider?.(audience) ?? Promise.resolve(null);
}

export function setTelemetryIdentity(identity: TelemetryIdentity): void {
  current = identity;
  for (const listener of listeners) listener();
}

export function getTelemetryIdentity(): TelemetryIdentity {
  return current;
}

/** Fires when the identity or the include-identity setting changes. */
export function onTelemetryIdentityChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

useTelemetrySettings.subscribe((state, previous) => {
  if (state.includeIdentity !== previous.includeIdentity) {
    for (const listener of listeners) listener();
  }
});

export function identityAttributes(
  identity: Partial<TelemetryIdentity> = current,
): Attributes {
  const attributes: Attributes = {};
  if (identity.identityKey)
    attributes['harbor.identity.key'] = identity.identityKey;
  if (identity.signingKey) {
    attributes['harbor.session.signing_key'] = identity.signingKey;
    if (identity.canSign !== undefined)
      attributes['harbor.session.can_sign'] = identity.canSign;
    if (identity.canRotate !== undefined)
      attributes['harbor.session.can_rotate'] = identity.canRotate;
  }
  return attributes;
}

/** Identity for the telemetry resource, honouring the user's setting. */
export function optInIdentityAttributes(): Attributes {
  if (!useTelemetrySettings.getState().includeIdentity) return {};
  return identityAttributes();
}

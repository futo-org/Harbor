import type { ReactNode } from 'react';

export interface PairIdentityCameraProps {
  onCodeScanned: (pairingCode: string) => void;
}

/**
 * `PairIdentityCamera` should conform to this type definition on both web and
 * native.
 */
export type PairIdentityCameraComponent = (
  props: PairIdentityCameraProps,
) => ReactNode;

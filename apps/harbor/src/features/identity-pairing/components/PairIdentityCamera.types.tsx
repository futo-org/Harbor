import type { ReactNode } from 'react';

export type PairIdentityCameraProps = {
  onCodeScanned: (scanned: string) => void;
};

/**
 * `PairIdentityCamera` should conform to this type definition on both web and
 * native.
 */
export type PairIdentityCameraComponent = (
  props: PairIdentityCameraProps,
) => ReactNode;

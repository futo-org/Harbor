import type { ReactNode } from 'react';

/** Wording for scanning something other than a pairing code */
export type ScanCopy = {
  hint: string;
  label: string;
  placeholder: string;
};

export const PAIRING_SCAN_COPY: ScanCopy = {
  hint: 'On your other device, go to Settings -> Pair Identity.',
  label: 'PAIRING LINK',
  placeholder: 'Paste pairing link',
};

export type PairIdentityCameraProps = {
  onCodeScanned: (scanned: string) => void;
  copy?: ScanCopy;
};

/**
 * `PairIdentityCamera` should conform to this type definition on both web and
 * native.
 */
export type PairIdentityCameraComponent = (
  props: PairIdentityCameraProps,
) => ReactNode;

import { requireIdentity } from '@/src/common/lib/authGate';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ClaimCreateSheet } from '../create/ClaimCreateSheet';
import { type ClaimLink, parseClaimLink } from './lib/claim-link';

type Params = Record<string, string | string[]>;

/** Opens the claim form a claim link asks for. Lives on the screen the link opens */
export function ClaimLinkHandler() {
  const params = useLocalSearchParams<Params>();
  const paramsKey = JSON.stringify(params);
  // Not the auth gate's copy, which is still unset on the first render
  const { hasIdentity } = useCurrentIdentity();

  // biome-ignore lint/correctness/useExhaustiveDependencies: params is a new object every render
  const link = useMemo(() => parseClaimLink(params), [paramsKey]);
  const linkKey = link ? paramsKey : null;

  // Kept after the params are cleared, so the sheet can animate away
  const [shown, setShown] = useState<{ key: string; link: ClaimLink } | null>(
    null,
  );

  if (link && linkKey && linkKey !== shown?.key) {
    setShown({ key: linkKey, link });
  }

  useEffect(() => {
    if (linkKey && !hasIdentity) requireIdentity().catch(() => {});
  }, [linkKey, hasIdentity]);

  if (!shown) return null;

  // The sheet is open while the link is in the params
  const close = () =>
    router.setParams(
      Object.fromEntries(Object.keys(params).map((key) => [key, undefined])),
    );

  return (
    <ClaimCreateSheet
      key={shown.key}
      open={!!link && hasIdentity}
      onClose={close}
      link={shown.link}
    />
  );
}

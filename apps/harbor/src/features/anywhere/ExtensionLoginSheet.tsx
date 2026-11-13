import {
  Button,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Sheet } from '@/src/common/components/sheet';
import { toast } from '@/src/common/components/toast';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { EmojiFingerprint } from '@/src/features/identity-pairing/components/EmojiFingerprint';
import { usePairIdentityIssuer } from '@/src/features/identity-pairing/hooks/usePairIdentityIssuer';
import {
  EncodingMode,
  encodePairingCode,
} from '@/src/features/identity-pairing/pairingCode';
import { Username } from '@/src/features/profile/Username';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  LOGIN_CANCEL_MESSAGE,
  LOGIN_READY_MESSAGE,
  LOGIN_REQUEST_MESSAGE,
  LOGIN_SESSION_MESSAGE,
} from './lib/login-messages';

/** Pairs the extension with the current identity, on the user's approval. */
export function ExtensionLoginSheet() {
  const { identity } = useCurrentIdentity();
  const identityKey = identity?.identityKey;
  const [open, setOpen] = useState(false);
  // Until the next page load.
  const declined = useRef(false);

  useEffect(() => {
    if (!isWeb || window.parent !== window || !identityKey) return;
    // The extension's content script posts into this window.
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin)
        return;
      // The extension gave up on the session it joined.
      if (event.data?.type === LOGIN_CANCEL_MESSAGE) setOpen(false);
      if (event.data?.type !== LOGIN_REQUEST_MESSAGE || declined.current)
        return;
      setOpen(true);
    };
    window.addEventListener('message', onMessage);
    // A request sent while the page was loading found nothing listening.
    window.postMessage({ type: LOGIN_READY_MESSAGE }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, [identityKey]);

  const close = () => {
    // The extension drops the session it joined.
    window.postMessage({ type: LOGIN_CANCEL_MESSAGE }, window.location.origin);
    setOpen(false);
  };
  const decline = () => {
    declined.current = true;
    close();
  };

  if (!identityKey) return null;

  return (
    <Sheet
      open={open}
      onClose={decline}
      detents={[0.6]}
      maxWidth={500}
      header={
        <Sheet.Header title="Sign in to Harbor Anywhere?" onClose={decline} />
      }
    >
      <Sheet.Content style={Atoms.gap_lg}>
        <View style={[Atoms.flex_row, Atoms.align_center, Atoms.gap_md]}>
          <ProfileAvatar identityKey={identityKey} />
          <Username identity={identityKey} fontWeight="bold" />
        </View>
        <Text variant="secondary" color="neutral_500">
          The Harbor Anywhere browser extension will be able to post and react
          as this identity.
        </Text>
        {open ? (
          <ExtensionPairing
            onDeny={decline}
            onDone={(error) => {
              if (error) {
                // Not a refusal: the next request may try again.
                toast.error(error);
                close();
                return;
              }
              toast.success('Harbor Anywhere is signed in');
              setOpen(false);
            }}
          />
        ) : null}
      </Sheet.Content>
    </Sheet>
  );
}

/** Issues a pairing session, then approves the key the user confirms. */
function ExtensionPairing({
  onDeny,
  onDone,
}: {
  onDeny: () => void;
  onDone: (error: string | null) => void;
}) {
  const { info, claimers, stage, error, approveClaimer } =
    usePairIdentityIssuer();
  const claimer = claimers.at(0);

  const sent = useRef(false);
  useEffect(() => {
    if (!info || sent.current) return;
    sent.current = true;
    window.postMessage(
      {
        type: LOGIN_SESSION_MESSAGE,
        code: encodePairingCode(info, EncodingMode.BASE64),
      },
      window.location.origin,
    );
  }, [info]);

  // Creating the session never settles while the server is unreachable.
  // biome-ignore lint/correctness/useExhaustiveDependencies: onDone is new each render
  useEffect(() => {
    if (info) return;
    const timeout = setTimeout(
      () => onDone('Could not reach your Harbor server'),
      15000,
    );
    return () => clearTimeout(timeout);
  }, [info]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: onDone is new each render
  useEffect(() => {
    if (stage === 'done') onDone(null);
    else if (stage === 'error') onDone(error ?? 'Sign in failed');
  }, [stage, error]);

  if (!claimer) return <ActivityIndicator />;

  return (
    <View style={[Atoms.items_center, Atoms.gap_lg]}>
      <EmojiFingerprint publicKey={claimer} bare />
      <Text variant="secondary" style={Atoms.text_center}>
        Approve only if Harbor Anywhere shows the same emoji.
      </Text>
      <View style={[Atoms.flex_row, Atoms.gap_sm]}>
        {/* A signing key: the extension posts, but cannot manage the identity. */}
        <Button
          title={stage === 'approving' ? 'Approving...' : 'Approve'}
          disabled={stage !== 'polling'}
          onPress={() => approveClaimer(claimer, false)}
        />
        <Button
          title="Deny"
          variant="secondary"
          disabled={stage !== 'polling'}
          onPress={onDeny}
        />
      </View>
    </View>
  );
}

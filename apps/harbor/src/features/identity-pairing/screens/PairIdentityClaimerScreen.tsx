import { EmojiImage } from '@/src/common/components/EmojiImage';
import { AVATAR_SIZE_MAP } from '@/src/common/components/Avatar/Avatar';
import {
  Button,
  IdentityTag,
  ProfileAvatar,
  Text,
} from '@/src/common/components/primitives';
import { Block, useShimmerOpacity } from '@/src/common/components/skeletons';
import {
  publicKeyToString,
  usePolycentric,
  usePolycentricContext,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { PairIdentityCamera } from '@/src/features/identity-pairing/components/PairIdentityCamera';
import { usePairIdentityClaimer } from '@/src/features/identity-pairing/hooks/usePairIdentityClaimer';
import { publicKeyEmojiFingerprint } from '@/src/features/identity-pairing/publicKeyEmojiFingerprint';
import { useOnboardingLinks } from '@/src/features/onboarding/hooks/useOnboardingLinks';
import { PAIRING_CODE_PARAM, Routes } from '@/src/common/constants';
import { router, useLocalSearchParams } from 'expo-router';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ActivityIndicator, View } from 'react-native';
import { extractPairingInfo } from '@/src/features/identity-pairing/pairingCode';
import { useProfile } from '@/src/features/profile/hooks/useProfile';
import { Username } from '@/src/features/profile/Username';
import { FetchMode } from '@polycentric/react-native';
import Animated from 'react-native-reanimated';

export default function PairIdentityClaimerScreen() {
  const { theme } = useTheme();
  const { refreshCurrentIdentity } = usePolycentricContext();
  const { to } = useOnboardingLinks();
  const code = useLocalSearchParams()[PAIRING_CODE_PARAM];

  // Error state is managed by `usePairIdentityClaimer()`, so we use `null`
  // to mean that the pairing link was invalid and couldn't be parsed and
  // `undefined` to mean that we just don't have one.
  const pairingInfo = useMemo(() => {
    if (code === undefined) return undefined;
    if (typeof code !== 'string') return null; // repeated `code` param
    return extractPairingInfo(code) ?? null;
  }, [code]);

  const onCodeScanned = useCallback((scanned: string) => {
    router.setParams({ [PAIRING_CODE_PARAM]: scanned });
  }, []);

  const { error, approved, stage, issuerIdentity, join } =
    usePairIdentityClaimer(pairingInfo);

  useEffect(() => {
    if (!approved) return;
    void (async () => {
      await refreshCurrentIdentity();
      // Carry the origin route through to the success screen.
      router.replace(to('/login/pair/success'));
    })();
  }, [approved, refreshCurrentIdentity, to]);

  let body: ReactNode;
  if (stage === 'unstarted' && pairingInfo !== undefined) {
    // This case only happens when we've parsed the pairing link but the hook
    // is behind.
    // We'll just render a blank page and it'll heal next render.
    body = null;
  } else if (stage === 'unstarted') {
    body = (
      <>
        <View style={Atoms.gap_xs}>
          <Text variant="subtitle">Pair Identity</Text>
        </View>
        <PairIdentityCamera onCodeScanned={onCodeScanned} />
      </>
    );
  } else if (stage === 'error') {
    body = (
      <>
        <Text variant="title">Error</Text>
        <Text variant="body" color="negative_500">
          {error}
        </Text>
        <Button
          title="Go Back"
          variant="secondary"
          fullWidth
          onPress={() => {
            router.replace(to(Routes.onboarding.pair));
          }}
        />
      </>
    );
  } else if (stage === 'confirming') {
    body = <ConfirmationBody issuer={issuerIdentity} onConfirm={join} />;
  } else {
    body = (
      <View
        style={[
          Atoms.flex_1,
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.gap_xl,
        ]}
      >
        {approved ? (
          <ApprovalLoadingBody />
        ) : (
          <>
            <PairingEmojiCard />
            <Text variant="secondary" style={{ textAlign: 'center' }}>
              Check your other device
            </Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        Atoms.flex_1,
        { backgroundColor: theme.atoms.bg.backgroundColor },
        ...(stage === 'unstarted' || stage === 'error'
          ? [Atoms.flex_col, Atoms.gap_lg]
          : []),
      ]}
    >
      {body}
    </View>
  );
}

function PairingEmojiCard() {
  const { theme } = useTheme();
  const client = usePolycentric();

  const pubKeyStr = client.currentKeyPair
    ? publicKeyToString(client.currentKeyPair.publicKey)
    : '';

  const pubKeyEmojis = pubKeyStr ? publicKeyEmojiFingerprint(pubKeyStr) : [];

  return (
    <View
      style={[
        Atoms.w_full,
        Atoms.items_center,
        Atoms.gap_md,
        Atoms.p_lg,
        Atoms.rounded_lg,
        {
          maxWidth: 350,
          backgroundColor: theme.palette.neutral_50,
        },
      ]}
    >
      <Text variant="subtitle" style={{ textAlign: 'center' }}>
        Your matching code
      </Text>

      <View
        style={[
          Atoms.w_full,
          Atoms.flex_row,
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.gap_lg,
          Atoms.rounded_lg,
          Atoms.flex_wrap,
          Atoms.py_lg,
          Atoms.px_lg,
          { backgroundColor: theme.palette.white },
        ]}
      >
        {pubKeyEmojis.map((emoji, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: short emoji sequence that doesn't reorder
          <EmojiImage key={i} sequence={emoji} size={60} />
        ))}
      </View>

      <Text
        variant="small"
        color="neutral_500"
        selectable
        style={[
          { fontFamily: 'monospace', textAlign: 'center' },
          // The pubkey string is a long string with no whitespace
          isWeb && { wordBreak: 'break-all' },
        ]}
      >
        {pubKeyStr}
      </Text>

      <View style={[Atoms.flex_row, Atoms.items_center, Atoms.gap_sm]}>
        <ActivityIndicator size="small" />
        <Text variant="small" color="neutral_500" style={Atoms.flex_shrink_1}>
          Waiting for approval from other device
        </Text>
      </View>
    </View>
  );
}

function ConfirmationBody({
  issuer,
  onConfirm,
}: {
  issuer: string | undefined;
  onConfirm: () => void;
}) {
  const { landing } = useOnboardingLinks();
  // Child components also use the profile information we fetch.
  const profile = useProfile(issuer, { fetchMode: FetchMode.Default });
  const showSkeleton = !issuer || profile.isLoading;

  // Disable the pair button at first
  const [allowPair, setAllowPair] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setAllowPair(true), 1000);
    return () => clearTimeout(timeout);
  }, []);

  const onCancel = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(landing);
    }
  };

  return (
    <View style={[Atoms.flex_1, Atoms.items_center, Atoms.justify_center]}>
      <View
        style={[
          Atoms.w_full,
          Atoms.items_center,
          Atoms.gap_xl,
          { maxWidth: 350 },
        ]}
      >
        <Text variant="title">Is this you?</Text>
        {showSkeleton ? (
          <IssuerProfileSkeleton />
        ) : (
          <IssuerProfile identityKey={issuer} />
        )}
        <View style={[Atoms.w_full, Atoms.flex_row, Atoms.gap_md]}>
          <View style={Atoms.flex_1}>
            <Button
              title="Cancel"
              variant="tertiary"
              fullWidth
              onPress={onCancel}
            />
          </View>
          <View style={Atoms.flex_1}>
            <Button
              title="Pair"
              variant="primary"
              fullWidth
              disabled={!allowPair}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function IssuerProfile({ identityKey }: { identityKey: string }) {
  return (
    <View style={[Atoms.items_center, Atoms.gap_sm]}>
      <ProfileAvatar identityKey={identityKey} size="xl" />
      <Username
        identity={identityKey}
        variant="subtitle"
        fontWeight="semibold"
        noFollowingBadge
        style={{ textAlign: 'center' }}
      />
      <IdentityTag identity={identityKey} />
    </View>
  );
}

/** Keep in sync with `IssuerProfile`. */
function IssuerProfileSkeleton() {
  const shimmer = useShimmerOpacity();
  return (
    <Animated.View style={[Atoms.items_center, Atoms.gap_sm, shimmer]}>
      <Block width={AVATAR_SIZE_MAP.xl} height={AVATAR_SIZE_MAP.xl} />
      <Block width={140} />
      <Block width={90} height={10} />
    </Animated.View>
  );
}

function ApprovalLoadingBody() {
  return (
    <>
      <Text variant="title" style={{ fontSize: 64, lineHeight: 72 }}>
        ✓
      </Text>
      <View style={[Atoms.items_center, Atoms.gap_xs]}>
        <Text variant="title">Approved!</Text>
        <Text
          variant="body"
          color="neutral_500"
          style={{ textAlign: 'center' }}
        >
          Completing setup...
        </Text>
      </View>
    </>
  );
}

import { Button, Text } from '@/src/common/components';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Sheet } from '@/src/common/components/sheet';
import { useToast } from '@/src/common/components/toast';
import { Routes } from '@/src/common/constants/routes';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import {
  Atoms,
  type PaletteColorToken,
  Spacing,
  useTheme,
  withHexOpacity,
} from '@/src/common/theme';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DecodedClaim } from '../hooks/useClaimById';
import { useClaimsList } from '../hooks/useClaimsList';
import type { ClaimRef } from '../hooks/useCreateClaim';
import useRequestVerification from '../hooks/useRequestVerification';
import { CLAIM_TYPES, type ClaimType } from '../utils/forms';
import type { Platform } from '../utils/platforms';
import { ClaimCreateProvider } from './ClaimCreateContext';
import { ClaimCreateForm, type ClaimFormState } from './ClaimCreateForm';
import { ClaimCreatePlatformLink } from './ClaimCreatePlatformLink';
import { ClaimCreatePlatformPicker } from './ClaimCreatePlatformPicker';
import { ClaimListItem } from './ClaimListItem';

// One sheet screen per step of the create-claim flow; steps form a stack so
// the back chevron retraces the path. With `requestFrom` the flow starts at
// a new/existing-claim chooser.
type Step =
  | { kind: 'choose' }
  | { kind: 'existing' }
  | { kind: 'type' }
  | { kind: 'form'; claimType: ClaimType }
  | { kind: 'platform' }
  | { kind: 'platform-link'; platform: Platform };

function stepTitle(step: Step): string {
  switch (step.kind) {
    case 'choose':
      return 'Request a verification';
    case 'existing':
      return 'Choose a claim';
    case 'type':
      return 'Create a claim';
    case 'form':
      return step.claimType.name;
    case 'platform':
      return 'Choose a platform';
    case 'platform-link':
      return step.platform.generic
        ? 'Link your website'
        : `Link ${step.platform.name}`;
  }
}

// Keyed per step so state resets and the enter animation replays.
function stepKey(step: Step): string {
  switch (step.kind) {
    case 'form':
      return `form-${step.claimType.name}`;
    case 'platform-link':
      return `platform-link-${step.platform.name}`;
    default:
      return step.kind;
  }
}

export function ClaimCreateSheet({
  open,
  onClose,
  requestFrom,
}: {
  open: boolean;
  onClose: () => void;
  // Identity to request verification from once the claim is created.
  requestFrom?: string;
}) {
  const { theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const initialStep: Step = requestFrom ? { kind: 'choose' } : { kind: 'type' };
  const [stack, setStack] = useState<Step[]>([initialStep]);

  const [form, setForm] = useState<ClaimFormState | null>(null);

  const { identityKey } = useCurrentIdentity();
  const existingClaims = useClaimsList(
    requestFrom ? (identityKey ?? undefined) : undefined,
  );
  const request = useRequestVerification();

  const step = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const push = (next: Step) => setStack((s) => [...s, next]);
  const pop = () => setStack((s) => s.slice(0, -1));

  // The component stays mounted while the sheet is closed; reset on close.
  const close = () => {
    onClose();
    setStack([initialStep]);
  };

  const onSelectClaimType = (claimType: ClaimType) =>
    push(
      claimType.platform ? { kind: 'platform' } : { kind: 'form', claimType },
    );

  // The requests list refreshes via query invalidation — no redirect.
  const onSelectExisting = async (claim: DecodedClaim) => {
    if (!requestFrom || request.isPending) return;
    try {
      await request.submit({ claimId: claim.id, identity: requestFrom });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      return;
    }
    toast.success('Verification requested');
    close();
  };

  const handleSubmitted = (ref: ClaimRef) => {
    // Without a pre-targeted verifier, the claim view opens the share sheet.
    toast.success(
      requestFrom ? 'Claim created — verification requested' : 'Claim created',
    );
    close();
    if (!requestFrom) {
      router.push(
        `${Routes.tabs.verification(
          ref.identity,
          ref.keyFingerprint,
          ref.sequence,
        )}?requestVerification=1`,
      );
    }
  };

  const options = useMemo(() => ({ requestFrom }), [requestFrom]);

  return (
    <Sheet
      open={open}
      onClose={close}
      detents={[0.5]}
      scrollable
      header={
        <Sheet.Header
          title={stepTitle(step)}
          closeIcon={canGoBack ? 'chevronBack' : 'close'}
          onClose={canGoBack ? pop : close}
          right={
            step.kind === 'form' ? (
              form?.isPending ? (
                <ActivityIndicator
                  size="small"
                  color={theme.palette.primary_500}
                  accessibilityLabel="Creating claim"
                />
              ) : (
                <Button
                  title="Create"
                  variant="primary"
                  size="sm"
                  disabled={!form?.isValid}
                  onPress={() => form?.submit()}
                />
              )
            ) : step.kind === 'existing' && request.isPending ? (
              <ActivityIndicator
                size="small"
                color={theme.palette.primary_500}
                accessibilityLabel="Requesting verification"
              />
            ) : undefined
          }
        />
      }
    >
      {/* The sheet portals its subtree, so the provider must ride inside. */}
      <ClaimCreateProvider value={options}>
        <Sheet.Content style={{ padding: 0 }}>
          {/* TrueSheet's `scrollable` pins this ScrollView and insets it for
              the keyboard. */}
          <ScrollView
            style={Atoms.flex_1}
            contentContainerStyle={[
              Atoms.pt_lg,
              { paddingBottom: insets.bottom + Spacing['lg'] },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View
              key={stepKey(step)}
              entering={FadeInDown.duration(200)}
              style={Atoms.gap_sm}
            >
              {step.kind === 'choose' && (
                <View style={{ marginTop: -Spacing['lg'] }}>
                  <OptionRow
                    icon="addCircleOutline"
                    color="primary_500"
                    title="New claim"
                    description="Create a new claim for them to verify."
                    onPress={() => push({ kind: 'type' })}
                  />
                  <OptionRow
                    icon="verify"
                    color="positive_500"
                    title="Existing claim"
                    description="Request verification of a claim you've already made."
                    onPress={() => push({ kind: 'existing' })}
                  />
                </View>
              )}

              {step.kind === 'existing' && (
                <View style={{ marginTop: -Spacing['lg'] }}>
                  {existingClaims.claims.map((claim) => (
                    <ClaimListItem
                      key={`${claim.keyFingerprint}-${claim.sequence}`}
                      claim={claim}
                      onPress={() => void onSelectExisting(claim)}
                    />
                  ))}
                  {existingClaims.claims.length === 0 &&
                    !existingClaims.isLoading && (
                      <Text
                        variant="body"
                        color="neutral_500"
                        style={Atoms.px_lg}
                      >
                        You haven&apos;t created any claims yet.
                      </Text>
                    )}
                </View>
              )}

              {step.kind === 'type' && (
                <>
                  <Text
                    variant="small"
                    style={[theme.atoms.text_neutral_medium, Atoms.px_lg]}
                    fontWeight="semibold"
                  >
                    Select the type of claim to create
                  </Text>
                  <View>
                    {CLAIM_TYPES.map((claimType, i) => (
                      <Animated.View
                        key={claimType.name}
                        entering={FadeInDown.delay(i * 40).duration(200)}
                      >
                        <ClaimTypeRow
                          claimType={claimType}
                          onPress={() => onSelectClaimType(claimType)}
                        />
                      </Animated.View>
                    ))}
                  </View>
                </>
              )}

              {step.kind === 'form' && (
                <View style={Atoms.px_lg}>
                  <ClaimCreateForm
                    claimType={step.claimType}
                    onSubmitted={handleSubmitted}
                    onFormState={setForm}
                  />
                </View>
              )}

              {step.kind === 'platform' && (
                <View style={Atoms.px_lg}>
                  <ClaimCreatePlatformPicker
                    onSelect={(platform) =>
                      push({ kind: 'platform-link', platform })
                    }
                  />
                </View>
              )}

              {step.kind === 'platform-link' && (
                <View style={Atoms.px_lg}>
                  <ClaimCreatePlatformLink platform={step.platform} />
                </View>
              )}
            </Animated.View>
          </ScrollView>
        </Sheet.Content>
      </ClaimCreateProvider>
    </Sheet>
  );
}

// An option in a picker step.
function OptionRow({
  icon,
  color,
  title,
  description,
  onPress,
}: {
  icon: IconName;
  color?: PaletteColorToken;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const tint = color ? theme.palette[color] : theme.palette.neutral_1000;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered, pressed }) => [
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_md,
        Atoms.px_lg,
        Atoms.py_md,
        (hovered || pressed) && {
          backgroundColor: theme.palette.neutral_25,
        },
      ]}
    >
      <View
        style={[
          Atoms.rounded_full,
          Atoms.p_sm,
          { backgroundColor: withHexOpacity(tint, '25') },
        ]}
      >
        <Icon name={icon} size={20} color={color} />
      </View>
      <View style={Atoms.flex_1}>
        <Text
          variant="secondary"
          fontWeight="semibold"
          style={theme.atoms.text}
          selectable={false}
        >
          {title}
        </Text>
        <Text
          variant="small"
          style={theme.atoms.text_neutral_medium}
          fontWeight="regular"
          selectable={false}
        >
          {description}
        </Text>
      </View>
      <Icon name="chevronForward" size={18} color="neutral_500" />
    </Pressable>
  );
}

function ClaimTypeRow({
  claimType,
  onPress,
}: {
  claimType: ClaimType;
  onPress: () => void;
}) {
  return (
    <OptionRow
      icon={claimType.icon}
      color={claimType.color}
      title={claimType.name}
      description={claimType.description}
      onPress={onPress}
    />
  );
}

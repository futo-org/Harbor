import { Button, Text } from '@/src/common/components';
import Icon from '@/src/common/components/Icon';
import { ScrollView } from '@/src/common/components/ScrollView';
import { Sheet } from '@/src/common/components/sheet';
import { useToast } from '@/src/common/components/toast';
import { Routes } from '@/src/common/constants/routes';
import { Atoms, Spacing, useTheme, withHexOpacity } from '@/src/common/theme';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClaimRef } from '../hooks/useCreateClaim';
import { CLAIM_TYPES, ClaimType } from '../utils/forms';
import { Platform } from '../utils/platforms';
import { ClaimCreateForm, ClaimFormState } from './ClaimCreateForm';
import { ClaimCreatePlatformLink } from './ClaimCreatePlatformLink';
import { ClaimCreatePlatformPicker } from './ClaimCreatePlatformPicker';

// One sheet screen per step of the create-claim flow. Steps form a stack so
// the header's back chevron retraces the path:
//   type -> form (submit), or type -> platform -> platform-link.
type Step =
  | { kind: 'type' }
  | { kind: 'form'; claimType: ClaimType }
  | { kind: 'platform' }
  | { kind: 'platform-link'; platform: Platform };

function stepTitle(step: Step): string {
  switch (step.kind) {
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
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [stack, setStack] = useState<Step[]>([{ kind: 'type' }]);

  const [form, setForm] = useState<ClaimFormState | null>(null);

  const step = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const push = (next: Step) => setStack((s) => [...s, next]);
  const pop = () => setStack((s) => s.slice(0, -1));

  // The component stays mounted while the sheet is closed, so reset the
  // stack on every close to start the next open at the first step.
  const close = () => {
    onClose();
    setStack([{ kind: 'type' }]);
  };

  const onSelectClaimType = (claimType: ClaimType) =>
    push(
      claimType.platform ? { kind: 'platform' } : { kind: 'form', claimType },
    );

  const handleSubmitted = (ref: ClaimRef) => {
    // Toast first, then navigate to the new claim's view, which opens the
    // request-verification sheet straight away for the fresh claim.
    toast.success('Claim created');
    close();
    router.push(
      `${Routes.tabs.verification(
        ref.identity,
        ref.keyFingerprint,
        ref.sequence,
      )}?requestVerification=1`,
    );
  };

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
            ) : undefined
          }
        />
      }
    >
      <Sheet.Content>
        {/* TrueSheet's `scrollable` pins this ScrollView and insets it for the
            keyboard, so focused inputs stay reachable while typing. */}
        <ScrollView
          style={Atoms.flex_1}
          contentContainerStyle={{
            paddingBottom: insets.bottom + Spacing['lg'],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            key={stepKey(step)}
            entering={FadeInDown.duration(200)}
            style={Atoms.gap_sm}
          >
            {step.kind === 'type' && (
              <>
                <Text
                  variant="small"
                  style={theme.atoms.text_neutral_medium}
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
              <ClaimCreateForm
                claimType={step.claimType}
                onSubmitted={handleSubmitted}
                onFormState={setForm}
              />
            )}

            {step.kind === 'platform' && (
              <ClaimCreatePlatformPicker
                onSelect={(platform) =>
                  push({ kind: 'platform-link', platform })
                }
              />
            )}

            {step.kind === 'platform-link' && (
              <ClaimCreatePlatformLink platform={step.platform} />
            )}
          </Animated.View>
        </ScrollView>
      </Sheet.Content>
    </Sheet>
  );
}

// A claim type in the picker: icon bubble, name, and a one-line explanation.
function ClaimTypeRow({
  claimType,
  onPress,
}: {
  claimType: ClaimType;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const tint = claimType.color
    ? theme.palette[claimType.color]
    : theme.palette.neutral_1000;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ hovered, pressed }) => [
        Atoms.flex_row,
        Atoms.align_center,
        Atoms.gap_md,
        Atoms.p_md,
        Atoms.rounded_md,
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
        <Icon name={claimType.icon} size={20} color={claimType.color} />
      </View>
      <View style={Atoms.flex_1}>
        <Text
          variant="secondary"
          fontWeight="semibold"
          style={theme.atoms.text}
          selectable={false}
        >
          {claimType.name}
        </Text>
        <Text
          variant="small"
          style={theme.atoms.text_neutral_medium}
          fontWeight="regular"
          selectable={false}
        >
          {claimType.description}
        </Text>
      </View>
      <Icon name="chevronForward" size={18} color="neutral_500" />
    </Pressable>
  );
}

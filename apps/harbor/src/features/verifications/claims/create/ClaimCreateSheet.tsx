import { Button, Text } from '@/src/common/components';
import Icon, { type IconName } from '@/src/common/components/Icon';
import { ImageDropOverlay } from '@/src/common/components/composites';
import { Sheet } from '@/src/common/components/sheet';
import { useToast } from '@/src/common/components/toast';
import { Routes } from '@/src/common/constants/routes';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { CalendarEventCard } from '@/src/features/calendar-events/card/CalendarEventCard';
import type { CalendarEventData } from '@/src/features/calendar-events/lib/calendar-event';
import { Atoms, Spacing, useTheme } from '@/src/common/theme';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { DecodedClaim } from '../../hooks/useClaimById';
import { useClaimsList } from '../../hooks/useClaimsList';
import type { ClaimRef } from '../../hooks/useCreateClaim';
import useRequestVerification from '../../hooks/useRequestVerification';
import {
  ATTENDANCE_CLAIM_TYPE,
  CLAIM_TYPES,
  type ClaimType,
} from '../../utils/forms';
import { attendanceValues } from '../../utils/attendance';
import type { Platform } from '../../utils/platforms';
import type { TintColors } from '../../utils/tint';
import { ClaimCreateProvider } from './ClaimCreateContext';
import {
  ClaimCreateEventNew,
  type EventFormState,
} from './ClaimCreateEventNew';
import { ClaimCreateEventPicker } from './ClaimCreateEventPicker';
import { ClaimCreateForm, type ClaimFormState } from './ClaimCreateForm';
import { ClaimCreatePlatformLink } from './ClaimCreatePlatformLink';
import { ClaimCreatePlatformOAuth } from './ClaimCreatePlatformOAuth';
import { ClaimCreatePlatformPicker } from './ClaimCreatePlatformPicker';
import { ClaimListItem } from '../ClaimListItem';

// One sheet screen per step of the create-claim flow; steps form a stack so
// the back chevron retraces the path. With `requestFrom` the flow starts at
// a new/existing-claim chooser.
type Step =
  | { kind: 'choose' }
  | { kind: 'existing' }
  | { kind: 'type' }
  | { kind: 'form'; claimType: ClaimType; calendarEvent?: CalendarEventData }
  | { kind: 'event' }
  | { kind: 'event-new' }
  | { kind: 'platform' }
  | { kind: 'platform-link'; platform: Platform }
  | { kind: 'platform-oauth'; platform: Platform };

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
    case 'event':
      return 'Choose the event';
    case 'event-new':
      return 'New event';
    case 'platform':
      return 'Choose a platform';
    case 'platform-link':
      return step.platform.generic
        ? 'Link your website'
        : `Link ${step.platform.name}`;
    case 'platform-oauth':
      return `Link ${step.platform.name}`;
  }
}

// Keyed per step so state resets and the enter animation replays.
function stepKey(step: Step): string {
  switch (step.kind) {
    case 'form':
      return `form-${step.claimType.name}-${step.calendarEvent?.id ?? ''}`;
    case 'platform-link':
      return `platform-link-${step.platform.name}`;
    case 'platform-oauth':
      return `platform-oauth-${step.platform.name}`;
    default:
      return step.kind;
  }
}

export function ClaimCreateSheet({
  open,
  onClose,
  requestFrom,
  calendarEvent,
}: {
  open: boolean;
  onClose: () => void;
  // Identity to request verification from once the claim is created.
  requestFrom?: string;
  // Start on an attendance claim for this event.
  calendarEvent?: CalendarEventData;
}) {
  const { theme } = useTheme();
  const toast = useToast();
  const initialStep: Step = calendarEvent
    ? attendanceStep(calendarEvent)
    : requestFrom
      ? { kind: 'choose' }
      : { kind: 'type' };
  const [stack, setStack] = useState<Step[]>([initialStep]);

  const [form, setForm] = useState<ClaimFormState | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState | null>(null);

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

  const onSelectClaimType = (claimType: ClaimType) => {
    if (claimType.platform) push({ kind: 'platform' });
    else if (claimType.calendarEvent) push({ kind: 'event' });
    else push({ kind: 'form', claimType });
  };

  // Replaces the new event step, so back returns to the picker
  const onEventCreated = (event: CalendarEventData) =>
    setStack((s) => [...s.slice(0, -1), attendanceStep(event)]);

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

  // Attendance claims ask the event's hosts to verify them
  const hostsToAsk =
    step.kind === 'form' && step.calendarEvent
      ? step.calendarEvent.hosts.filter((host) => host !== identityKey)
      : [];

  const handleSubmitted = (ref: ClaimRef) => {
    const requested = !!requestFrom || hostsToAsk.length > 0;

    toast.success(
      requested ? 'Claim created — verification requested' : 'Claim created',
    );
    close();

    if (requestFrom) return;

    const claimRoute = Routes.tabs.verification(
      ref.identity,
      ref.keyFingerprint,
      ref.sequence,
    );

    // With nobody asked yet, the claim view opens the share sheet.
    router.navigate(
      requested ? claimRoute : `${claimRoute}?requestVerification=1`,
    );
  };

  // Platform claims are verified by the verifier servers during the flow, so
  // the claim view opens without the request-verification prompt.
  const handleVerified = (ref: ClaimRef) => {
    toast.success('Account verified');
    close();
    if (!requestFrom) {
      router.navigate(
        Routes.tabs.verification(
          ref.identity,
          ref.keyFingerprint,
          ref.sequence,
        ),
      );
    }
  };

  const options = useMemo(() => ({ requestFrom }), [requestFrom]);

  // The steps that end in a Create button
  const create: CreateButtonProps | null =
    step.kind === 'form'
      ? {
          pendingLabel: 'Creating claim',
          isPending: !!form?.isPending,
          disabled: !form?.isValid,
          onPress: () => form?.submit(),
        }
      : step.kind === 'event-new'
        ? {
            pendingLabel: 'Creating event',
            isPending: !!eventForm?.isPending,
            disabled: !eventForm?.canSubmit,
            onPress: () => eventForm?.submit(),
          }
        : null;

  // Images, the event list and the event form don't fit at half height
  const isTall =
    !!form?.hasAttachments ||
    step.kind === 'event' ||
    step.kind === 'event-new';

  return (
    <Sheet
      open={open}
      onClose={close}
      detents={isTall ? [1] : [0.5]}
      header={
        <Sheet.Header
          title={stepTitle(step)}
          closeIcon={canGoBack ? 'chevronBack' : 'close'}
          onClose={canGoBack ? pop : close}
          disabled={form?.isPending || eventForm?.isPending}
          right={
            create ? (
              <CreateButton {...create} />
            ) : step.kind === 'existing' && request.isPending ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.accent}
                accessibilityLabel="Requesting verification"
              />
            ) : undefined
          }
        />
      }
      overlay={
        form ? (
          <ImageDropOverlay
            onDrop={form.ingestAssets}
            remainingSlots={form.remainingAttachmentSlots}
            disabled={form.attachDisabled}
          />
        ) : undefined
      }
    >
      {/* The sheet portals its subtree, so the provider must ride inside. */}
      <ClaimCreateProvider value={options}>
        <Sheet.Content scrollable={false} style={{ padding: 0 }}>
          {/* RN's ScrollView, so TrueSheet finds it to pin and inset. */}
          <ScrollView
            style={Atoms.flex_1}
            contentContainerStyle={[Atoms.pt_lg, Atoms.pb_lg]}
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
                    tint={{
                      fg: theme.colors.accent,
                      bg: theme.colors.box.accent.bg_subtle,
                    }}
                    title="New claim"
                    description="Create a new claim for them to verify."
                    onPress={() => push({ kind: 'type' })}
                  />
                  <OptionRow
                    icon="verify"
                    tint={{
                      fg: theme.colors.success,
                      bg: theme.colors.box.success.bg_subtle,
                    }}
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
                      <Text variant="body" color="muted" style={Atoms.px_lg}>
                        You haven&apos;t created any claims yet.
                      </Text>
                    )}
                </View>
              )}

              {step.kind === 'type' && (
                <>
                  <Text
                    variant="small"
                    color="secondary"
                    style={Atoms.px_lg}
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
                    initialValues={
                      step.calendarEvent
                        ? attendanceValues(step.calendarEvent)
                        : undefined
                    }
                    header={
                      step.calendarEvent ? (
                        <CalendarEventCard
                          event={step.calendarEvent}
                          embedded
                          linkToEvent={false}
                        />
                      ) : undefined
                    }
                    alsoRequestFrom={hostsToAsk}
                    onSubmitted={handleSubmitted}
                    onFormState={setForm}
                  />
                </View>
              )}

              {step.kind === 'event' && (
                <ClaimCreateEventPicker
                  onSelect={(event) => push(attendanceStep(event))}
                  onCreateNew={() => push({ kind: 'event-new' })}
                />
              )}

              {step.kind === 'event-new' && (
                <View style={Atoms.px_lg}>
                  <ClaimCreateEventNew
                    onCreated={onEventCreated}
                    onFormState={setEventForm}
                  />
                </View>
              )}

              {step.kind === 'platform' && (
                <View style={Atoms.px_lg}>
                  <ClaimCreatePlatformPicker
                    onSelect={(platform, verifierType) =>
                      push(
                        verifierType === 'oauth'
                          ? { kind: 'platform-oauth', platform }
                          : { kind: 'platform-link', platform },
                      )
                    }
                  />
                </View>
              )}

              {step.kind === 'platform-link' && (
                <View style={Atoms.px_lg}>
                  <ClaimCreatePlatformLink
                    platform={step.platform}
                    onVerified={handleVerified}
                  />
                </View>
              )}

              {step.kind === 'platform-oauth' && (
                <View style={Atoms.px_lg}>
                  <ClaimCreatePlatformOAuth
                    platform={step.platform}
                    onVerified={handleVerified}
                  />
                </View>
              )}
            </Animated.View>
          </ScrollView>
        </Sheet.Content>
      </ClaimCreateProvider>
    </Sheet>
  );
}

type CreateButtonProps = {
  pendingLabel: string;
  isPending: boolean;
  disabled: boolean;
  onPress: () => void;
};

// The header's Create button, or a spinner while it's working.
function CreateButton({
  pendingLabel,
  isPending,
  disabled,
  onPress,
}: CreateButtonProps) {
  const { theme } = useTheme();

  if (isPending) {
    return (
      <ActivityIndicator
        size="small"
        color={theme.colors.accent}
        accessibilityLabel={pendingLabel}
      />
    );
  }

  return (
    <Button
      title="Create"
      variant="primary"
      size="sm"
      disabled={disabled}
      onPress={onPress}
    />
  );
}

function attendanceStep(calendarEvent: CalendarEventData): Step {
  return { kind: 'form', claimType: ATTENDANCE_CLAIM_TYPE, calendarEvent };
}

// An option in a picker step.
function OptionRow({
  icon,
  tint,
  title,
  description,
  onPress,
}: {
  icon: IconName;
  tint: TintColors;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();

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
        (hovered || pressed) && theme.atoms.box.primary.bg_hover,
      ]}
    >
      <View
        style={[Atoms.rounded_full, Atoms.p_sm, { backgroundColor: tint.bg }]}
      >
        <Icon name={icon} size={20} customColor={tint.fg} />
      </View>
      <View style={Atoms.flex_1}>
        <Text variant="secondary" fontWeight="semibold" selectable={false}>
          {title}
        </Text>
        <Text
          variant="small"
          color="secondary"
          fontWeight="regular"
          selectable={false}
        >
          {description}
        </Text>
      </View>
      <Icon name="chevronForward" size={18} color="muted" />
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
  const { theme } = useTheme();
  return (
    <OptionRow
      icon={claimType.icon}
      tint={claimType.tint[theme.scheme]}
      title={claimType.name}
      description={claimType.description}
      onPress={onPress}
    />
  );
}

import { Text, TextInput } from '@/src/common/components';
import {
  AttachImageButtons,
  AttachmentGrid,
} from '@/src/common/components/composites';
import { DateTimeField } from '@/src/common/components/form/DateTimeField/DateTimeField';
import Icon from '@/src/common/components/Icon';
import { Atoms, useTheme } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { Pressable, Switch, type TextInputInstance, View } from 'react-native';
import { HostField } from './HostField';
import type { CoverPhoto } from '../hooks/useCoverPhoto';
import type { CalendarEventForm } from '../lib/calendar-event';
import { placeLabel } from '../lib/geocoder-api';
import { PlaceField } from './PlaceField';

type CalendarEventFormFieldsProps = {
  form: CalendarEventForm;
  onChange: (changes: Partial<CalendarEventForm>) => void;
  coverPhoto: CoverPhoto;
  disabled: boolean;
  titleRef?: React.Ref<TextInputInstance>;
};

/** Fields of the create event form */
export function CalendarEventFormFields({
  form,
  onChange,
  coverPhoto,
  disabled,
  titleRef,
}: CalendarEventFormFieldsProps) {
  return (
    <>
      <Field label="Title *">
        <TextInput
          ref={titleRef}
          value={form.title}
          onChangeText={(title) => onChange({ title })}
          placeholder="What's happening?"
          maxLength={200}
          disabled={disabled}
          testID="calendar-event-create-title"
        />
      </Field>
      <Field label="Date *">
        <DateTimeField
          mode="date"
          value={form.date}
          onChange={(date) => onChange({ date })}
          placeholder="Choose a date"
          disabled={disabled}
          testID="calendar-event-create-date"
        />
      </Field>
      <SwitchRow
        label="All day"
        value={form.allDay}
        onValueChange={(allDay) => onChange({ allDay })}
        disabled={disabled}
      />
      {form.allDay ? null : (
        <View style={[Atoms.flex_row, Atoms.gap_md]}>
          <Field label="Starts *" style={Atoms.flex_1}>
            <DateTimeField
              mode="time"
              value={form.startTime}
              onChange={(startTime) => onChange({ startTime })}
              placeholder="Start time"
              disabled={disabled}
              testID="calendar-event-create-start-time"
            />
          </Field>
          <Field label="Ends" style={Atoms.flex_1}>
            <DateTimeField
              mode="time"
              value={form.endTime}
              onChange={(endTime) => onChange({ endTime })}
              placeholder="End time"
              disabled={disabled}
            />
          </Field>
        </View>
      )}
      {/* zIndex so the suggestions float over the fields below */}
      <Field label="Location" style={{ zIndex: 2 }}>
        <PlaceField
          value={form.location}
          onChangeText={(location) =>
            onChange({ location, locationPlace: undefined })
          }
          onChoose={(place) =>
            onChange({ location: placeLabel(place), locationPlace: place })
          }
          picked={!!form.locationPlace}
          disabled={disabled}
        />
      </Field>
      <SwitchRow
        label="Are you the host?"
        value={form.isHost}
        onValueChange={(isHost) => onChange({ isHost })}
        disabled={disabled}
        testID="calendar-event-create-is-host"
      />
      {form.isHost ? null : (
        <Field label="Hosts" style={{ zIndex: 1 }}>
          <HostField
            hosts={form.hosts}
            onChange={(hosts) => onChange({ hosts })}
            disabled={disabled}
          />
        </Field>
      )}
      <Field label="Link">
        <TextInput
          value={form.locationUrl}
          onChangeText={(locationUrl) => onChange({ locationUrl })}
          placeholder="https://… for online events"
          autoCapitalize="none"
          keyboardType="url"
          disabled={disabled}
        />
      </Field>
      <Field label="Cover photo">
        <CoverPhotoField coverPhoto={coverPhoto} disabled={disabled} />
      </Field>
      <Field label="Description">
        <TextInput
          value={form.description}
          onChangeText={(description) => onChange({ description })}
          placeholder="Anything people should know"
          maxLength={5000}
          multiline
          numberOfLines={4}
          disabled={disabled}
        />
      </Field>
    </>
  );
}

type CoverPhotoFieldProps = {
  coverPhoto: CoverPhoto;
  disabled: boolean;
};

function CoverPhotoField({ coverPhoto, disabled }: CoverPhotoFieldProps) {
  const { theme } = useTheme();

  const {
    cover,
    attachDisabled,
    handleAttachImage,
    handleCaptureImage,
    handleRemoveAttachment,
  } = coverPhoto;

  if (cover.length > 0) {
    return (
      <AttachmentGrid
        attachments={cover}
        disabled={disabled}
        onRemoveAttachment={handleRemoveAttachment}
      />
    );
  }

  return (
    <View style={Atoms.gap_xs}>
      <Pressable
        accessibilityRole="button"
        testID="calendar-event-create-cover"
        disabled={attachDisabled}
        onPress={() => void handleAttachImage()}
        style={({ hovered, pressed }) => [
          Atoms.items_center,
          Atoms.justify_center,
          Atoms.gap_xs,
          Atoms.border,
          Atoms.rounded_md,
          { aspectRatio: 16 / 5, borderStyle: 'dashed' },
          theme.atoms.outline_strong,
          (hovered || pressed) && theme.atoms.box.primary.bg_hover,
        ]}
      >
        <Icon name="image" size={24} color="muted" />
        <Text variant="secondary" color="muted" selectable={false}>
          Add a cover photo
        </Text>
      </Pressable>
      {isWeb ? null : (
        <AttachImageButtons
          onCaptureImage={() => void handleCaptureImage()}
          disabled={attachDisabled}
        />
      )}
    </View>
  );
}

type FieldLabelProps = { children: string };

function FieldLabel({ children }: FieldLabelProps) {
  return (
    <Text variant="small" color="secondary" fontWeight="semibold">
      {children}
    </Text>
  );
}

type SwitchRowProps = { label: string } & React.ComponentProps<typeof Switch>;

function SwitchRow({ label, ...switchProps }: SwitchRowProps) {
  return (
    <View style={[Atoms.flex_row, Atoms.align_center, Atoms.justify_between]}>
      <FieldLabel>{label}</FieldLabel>
      <Switch {...switchProps} />
    </View>
  );
}

type FieldProps = {
  label: string;
  style?: React.ComponentProps<typeof View>['style'];
  children: React.ReactNode;
};

function Field({ label, style, children }: FieldProps) {
  return (
    <View style={[Atoms.gap_xs, style]}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </View>
  );
}

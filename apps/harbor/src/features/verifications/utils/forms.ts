import type { IconName } from '@/src/common/components/Icon';
import { ATTENDANCE_FIELD, ATTENDANCE_SCHEMA_NAME } from './attendance';
import { buildTint, type Tint } from './tint';

// A single input in a claim form. `kind` is purely a UI concern (which widget
// to render) — it does not appear in the verification schema.
export type FormFieldKind = 'text' | 'multiline' | 'date';

export interface FormField {
  key: string;
  label: string;
  kind: FormFieldKind;
  required?: boolean;
  // Filled in by the app, so no input is shown.
  hidden?: boolean;
}

// A claim type and the form used to collect it.
export interface ClaimType {
  name: string;
  description: string;
  icon: IconName;
  tint: Tint;
  fields: FormField[];
  platform?: boolean;
  // Made about a calendar event, which is picked before the form.
  calendarEvent?: boolean;
}

// Every claim (except platform) ends with a free-form description.
const DESCRIPTION: FormField = {
  key: 'description',
  label: 'Description',
  kind: 'multiline',
};

// The event's details, copied in by the app rather than typed.
const eventField = (
  key: string,
  label: string,
  required = false,
): FormField => ({
  key,
  label,
  kind: 'text',
  required,
  hidden: true,
});

export const ATTENDANCE_CLAIM_TYPE: ClaimType = {
  name: ATTENDANCE_SCHEMA_NAME,
  description: 'An event you went to.',
  icon: 'calendar',
  tint: buildTint('#2F7FD9', '#6BA6EA'),
  calendarEvent: true,
  fields: [
    eventField(ATTENDANCE_FIELD.event, 'Event', true),
    eventField(ATTENDANCE_FIELD.startsAt, 'Starts', true),
    eventField(ATTENDANCE_FIELD.endsAt, 'Ends'),
    eventField(ATTENDANCE_FIELD.location, 'Location'),
    eventField(ATTENDANCE_FIELD.eventKey, 'Event key', true),
    eventField(ATTENDANCE_FIELD.eventDigest, 'Event digest'),
    DESCRIPTION,
  ],
};

export const CLAIM_TYPES: ClaimType[] = [
  {
    name: 'Freeform',
    description: 'Anything you want to claim, in your own words.',
    icon: 'form',
    tint: buildTint('#E7677F', '#9A263A'),
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      DESCRIPTION,
    ],
  },
  {
    name: 'Platform',
    description: 'Prove you own an account on another social platform.',
    icon: 'cardOutline',
    tint: buildTint('#5F6B7F', '#97999B'),
    fields: [],
    platform: true,
  },
  ATTENDANCE_CLAIM_TYPE,
  {
    name: 'Occupation',
    description: 'A job or position you hold or have held.',
    icon: 'briefcaseOutline',
    tint: buildTint('#008000'),
    fields: [
      { key: 'job_title', label: 'Job Title', kind: 'text', required: true },
      { key: 'company', label: 'Company', kind: 'text', required: true },
      { key: 'location', label: 'Location', kind: 'text', required: true },
      { key: 'start_date', label: 'Start Date', kind: 'date', required: true },
      { key: 'end_date', label: 'End Date', kind: 'date' },
      DESCRIPTION,
    ],
  },
  {
    name: 'Skill',
    description: 'A skill or expertise you have.',
    icon: 'bookOutline',
    tint: buildTint('#FF731F'),
    fields: [
      { key: 'skill', label: 'Skill', kind: 'text', required: true },
      DESCRIPTION,
    ],
  },
  {
    name: 'Education',
    description: 'A degree, certification, or course you completed.',
    icon: 'certificateOutline',
    tint: buildTint('#E59400', '#FFA500'),
    fields: [
      {
        key: 'institution',
        label: 'Institution',
        kind: 'text',
        required: true,
      },
      {
        key: 'certification',
        label: 'Certification',
        kind: 'text',
        required: true,
      },
      { key: 'year', label: 'Year', kind: 'text', required: true },
      DESCRIPTION,
    ],
  },
];

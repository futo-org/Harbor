import { IconName } from '@/src/common/components/Icon';
import { PaletteColorToken } from '@/src/common/theme';

// A single input in a claim form. `kind` is purely a UI concern (which widget
// to render) — it does not appear in the verification schema.
export type FormFieldKind = 'text' | 'multiline' | 'date';

export interface FormField {
  key: string;
  label: string;
  kind: FormFieldKind;
  required?: boolean;
}

// A claim type and the form used to collect it.
export interface ClaimType {
  name: string;
  description: string;
  icon: IconName;
  color?: PaletteColorToken;
  fields: FormField[];
  platform?: boolean;
}

// Every claim (except platform) ends with a free-form description.
const DESCRIPTION: FormField = {
  key: 'description',
  label: 'Description',
  kind: 'multiline',
};

export const CLAIM_TYPES: ClaimType[] = [
  {
    name: 'Freeform',
    description: 'Anything you want to claim, in your own words.',
    icon: 'form',
    color: 'negative_300',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      DESCRIPTION,
    ],
  },
  {
    name: 'Platform',
    description: 'Prove you own an account on another social platform.',
    icon: 'cardOutline',
    color: 'neutral_600',
    fields: [],
    platform: true,
  },
  {
    name: 'Occupation',
    description: 'A job or position you hold or have held.',
    icon: 'briefcaseOutline',
    color: 'positive_500',
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
    color: 'primary_400',
    fields: [
      { key: 'skill', label: 'Skill', kind: 'text', required: true },
      DESCRIPTION,
    ],
  },
  {
    name: 'Education',
    description: 'A degree, certification, or course you completed.',
    icon: 'certificateOutline',
    color: 'warning_500',
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

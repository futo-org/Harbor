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
    icon: 'form',
    color: 'negative_300',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      DESCRIPTION,
    ],
  },
  {
    name: 'Platform',
    icon: 'cardOutline',
    color: 'neutral_600',
    fields: [],
    platform: true,
  },
  {
    name: 'Occupation',
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
    icon: 'bookOutline',
    color: 'primary_400',
    fields: [
      { key: 'skill', label: 'Skill', kind: 'text', required: true },
      DESCRIPTION,
    ],
  },
  {
    name: 'Education',
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

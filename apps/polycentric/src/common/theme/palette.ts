export type Palette = {
  white: string;
  black: string;
  like: string;

  neutral_0: string;
  neutral_25: string;
  neutral_50: string;
  neutral_100: string;
  neutral_200: string;
  neutral_300: string;
  neutral_400: string;
  neutral_500: string;
  neutral_600: string;
  neutral_700: string;
  neutral_800: string;
  neutral_900: string;
  neutral_950: string;
  neutral_975: string;
  neutral_1000: string;

  primary_25: string;
  primary_50: string;
  primary_100: string;
  primary_200: string;
  primary_300: string;
  primary_400: string;
  primary_500: string;
  primary_600: string;
  primary_700: string;
  primary_800: string;
  primary_900: string;
  primary_950: string;
  primary_975: string;

  positive_25: string;
  positive_50: string;
  positive_100: string;
  positive_200: string;
  positive_300: string;
  positive_400: string;
  positive_500: string;
  positive_600: string;
  positive_700: string;
  positive_800: string;
  positive_900: string;
  positive_950: string;
  positive_975: string;

  negative_25: string;
  negative_50: string;
  negative_100: string;
  negative_200: string;
  negative_300: string;
  negative_400: string;
  negative_500: string;
  negative_600: string;
  negative_700: string;
  negative_800: string;
  negative_900: string;
  negative_950: string;
  negative_975: string;

  warning_25: string;
  warning_50: string;
  warning_100: string;
  warning_200: string;
  warning_300: string;
  warning_400: string;
  warning_500: string;
  warning_600: string;
  warning_700: string;
  warning_800: string;
  warning_900: string;
  warning_950: string;
  warning_975: string;

  info_25: string;
  info_50: string;
  info_100: string;
  info_200: string;
  info_300: string;
  info_400: string;
  info_500: string;
  info_600: string;
  info_700: string;
  info_800: string;
  info_900: string;
  info_950: string;
  info_975: string;

  background_primary: string;
  background_secondary: string;
};

export const lightPalette = {
  white: '#FFFFFF',
  black: '#000000',
  like: '#1EA3E5',

  neutral_0: '#FFFFFF',
  neutral_25: '#F2F5F9',
  neutral_50: '#E8EDF5',
  neutral_100: '#DDE3EE',
  neutral_200: '#CDD5E4',
  neutral_300: '#A8B2C4',
  neutral_400: '#94A0B4',
  neutral_500: '#7C869D',
  neutral_600: '#5F6B7F',
  neutral_700: '#3D4555',
  neutral_800: '#2A303D',
  neutral_900: '#1A1F29',
  neutral_950: '#12161E',
  neutral_975: '#0D1016',
  neutral_1000: '#000000',

  primary_25: '#EDF8FE',
  primary_50: '#DCF3FC',
  primary_100: '#C5E9FA',
  primary_200: '#9DD8F4',
  primary_300: '#6BC4EF',
  primary_400: '#4BB5EA',
  primary_500: '#1EA3E5',
  primary_600: '#0854AA',
  primary_700: '#0A4C96',
  primary_800: '#073D7A',
  primary_900: '#062343',
  primary_950: '#051A35',
  primary_975: '#041229',

  positive_25: '#E8F5E8',
  positive_50: '#D1EBD1',
  positive_100: '#A3D6A3',
  positive_200: '#75C175',
  positive_300: '#47AC47',
  positive_400: '#1F961F',
  positive_500: '#008000',
  positive_600: '#006E00',
  positive_700: '#005C00',
  positive_800: '#004A00',
  positive_900: '#003800',
  positive_950: '#002800',
  positive_975: '#001C00',

  negative_25: '#FCECEF',
  negative_50: '#F9D9DF',
  negative_100: '#F3B3BF',
  negative_200: '#ED8D9F',
  negative_300: '#E7677F',
  negative_400: '#E1415F',
  negative_500: '#D9314D',
  negative_600: '#B7283F',
  negative_700: '#951F31',
  negative_800: '#731623',
  negative_900: '#510D17',
  negative_950: '#3B090F',
  negative_975: '#2A060A',

  warning_25: '#FFF6E5',
  warning_50: '#FFEDCB',
  warning_100: '#FFDB97',
  warning_200: '#FFC963',
  warning_300: '#FFB72F',
  warning_400: '#FFA500',
  warning_500: '#E59400',
  warning_600: '#CC8400',
  warning_700: '#B37300',
  warning_800: '#996200',
  warning_900: '#805200',
  warning_950: '#664100',
  warning_975: '#4D3100',

  info_25: '#EDF8FE',
  info_50: '#DCF3FC',
  info_100: '#C5E9FA',
  info_200: '#9DD8F4',
  info_300: '#6BC4EF',
  info_400: '#4BB5EA',
  info_500: '#1EA3E5',
  info_600: '#0854AA',
  info_700: '#0A4C96',
  info_800: '#073D7A',
  info_900: '#062343',
  info_950: '#051A35',
  info_975: '#041229',

  background_primary: '#F2F5F9',
  background_secondary: '#ADD1F9',
} as const satisfies Palette;

export const darkPalette = {
  white: '#FFFFFF',
  black: '#000000',
  like: '#1EA3E5',

  neutral_0: '#05080E',
  neutral_25: '#0C1220',
  neutral_50: '#121A2B',
  neutral_100: '#1A2436',
  neutral_200: '#252F42',
  neutral_300: '#3D4A5F',
  neutral_400: '#7C869D',
  neutral_500: '#8E96A8',
  neutral_600: '#A5ACBB',
  neutral_700: '#B8BECA',
  neutral_800: '#D0D4DD',
  neutral_900: '#E4E7ED',
  neutral_950: '#F0F2F6',
  neutral_975: '#F7F8FB',
  neutral_1000: '#FFFFFF',

  primary_25: '#0A1A24',
  primary_50: '#0F2533',
  primary_100: '#153445',
  primary_200: '#1C4A62',
  primary_300: '#1E6A8C',
  primary_400: '#1E8BC4',
  primary_500: '#1EA3E5',
  primary_600: '#3BB0E8',
  primary_700: '#5CBEEC',
  primary_800: '#85CEF0',
  primary_900: '#B0E0F6',
  primary_950: '#D2EDFA',
  primary_975: '#E8F6FC',

  positive_25: '#0A1F0A',
  positive_50: '#0F2E0F',
  positive_100: '#154515',
  positive_200: '#1A5C1A',
  positive_300: '#1F731F',
  positive_400: '#248A24',
  positive_500: '#008000',
  positive_600: '#2FA82F',
  positive_700: '#4FBF4F',
  positive_800: '#7AD37A',
  positive_900: '#A8E4A8',
  positive_950: '#D1F2D1',
  positive_975: '#E8F9E8',

  negative_25: '#2A0A10',
  negative_50: '#3D0F17',
  negative_100: '#5A1622',
  negative_200: '#7A1E2E',
  negative_300: '#9A263A',
  negative_400: '#C42D48',
  negative_500: '#D9314D',
  negative_600: '#E55D74',
  negative_700: '#ED8496',
  negative_800: '#F5ADB9',
  negative_900: '#FAD0D8',
  negative_950: '#FCE8EC',
  negative_975: '#FDF4F6',

  warning_25: '#2A1F0A',
  warning_50: '#3D2E0F',
  warning_100: '#5C4515',
  warning_200: '#805F1A',
  warning_300: '#A67A1F',
  warning_400: '#CC9624',
  warning_500: '#FFA500',
  warning_600: '#FFB733',
  warning_700: '#FFC966',
  warning_800: '#FFDB99',
  warning_900: '#FFEDCC',
  warning_950: '#FFF5E0',
  warning_975: '#FFFAEF',

  info_25: '#0A1A24',
  info_50: '#0F2533',
  info_100: '#153445',
  info_200: '#1C4A62',
  info_300: '#1E6A8C',
  info_400: '#1E8BC4',
  info_500: '#1EA3E5',
  info_600: '#3BB0E8',
  info_700: '#5CBEEC',
  info_800: '#85CEF0',
  info_900: '#B0E0F6',
  info_950: '#D2EDFA',
  info_975: '#E8F6FC',

  background_primary: '#05080E',
  background_secondary: '#062343',
} as const satisfies Palette;

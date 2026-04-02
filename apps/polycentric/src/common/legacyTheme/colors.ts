export interface ColorScheme {
  primary: string;
  primaryOpacity10: string;
  primaryOpacity15: string;
  primaryOpacity20: string;
  primaryOpacity40: string;
  primaryOpacity60: string;
  primaryOpacity80: string;

  primaryDarker: string;
  primaryDarkerOpacity10: string;
  primaryDarkerOpacity15: string;
  primaryDarkerOpacity20: string;
  primaryDarkerOpacity40: string;
  primaryDarkerOpacity60: string;
  primaryDarkerOpacity80: string;

  primaryDarkest: string;
  primaryDarkestOpacity10: string;
  primaryDarkestOpacity15: string;
  primaryDarkestOpacity20: string;
  primaryDarkestOpacity40: string;
  primaryDarkestOpacity60: string;
  primaryDarkestOpacity80: string;

  backgroundPrimary: string;
  backgroundSecondary: string;

  neutralSurface: string;
  neutralSurfaceOpacity10: string;
  neutralSurfaceOpacity15: string;
  neutralSurfaceOpacity20: string;
  neutralSurfaceOpacity40: string;
  neutralSurfaceOpacity60: string;
  neutralSurfaceOpacity80: string;

  success: string;
  successOpacity10: string;
  successOpacity15: string;
  successOpacity20: string;
  successOpacity40: string;
  successOpacity60: string;
  successOpacity80: string;

  warning: string;
  warningOpacity10: string;
  warningOpacity15: string;
  warningOpacity20: string;
  warningOpacity40: string;
  warningOpacity60: string;
  warningOpacity80: string;

  info: string;
  infoOpacity10: string;
  infoOpacity15: string;
  infoOpacity20: string;
  infoOpacity40: string;
  infoOpacity60: string;
  infoOpacity80: string;

  destructive: string;
  destructiveOpacity10: string;
  destructiveOpacity15: string;
  destructiveOpacity20: string;
  destructiveOpacity40: string;
  destructiveOpacity60: string;
  destructiveOpacity80: string;

  text: string;
  black: string;
  white: string;
}

export type ColorToken = keyof ColorScheme;

export const colors = {
  light: {
    primary: '#1EA3E5',
    primaryOpacity10: '#1EA3E510',
    primaryOpacity15: '#1EA3E515',
    primaryOpacity20: '#1EA3E520',
    primaryOpacity40: '#1EA3E540',
    primaryOpacity60: '#1EA3E560',
    primaryOpacity80: '#1EA3E580',

    primaryDarker: '#0854AA',
    primaryDarkerOpacity10: '#0854AA10',
    primaryDarkerOpacity15: '#0854AA15',
    primaryDarkerOpacity20: '#0854AA20',
    primaryDarkerOpacity40: '#0854AA40',
    primaryDarkerOpacity60: '#0854AA60',
    primaryDarkerOpacity80: '#0854AA80',

    primaryDarkest: '#062343',
    primaryDarkestOpacity10: '#06234310',
    primaryDarkestOpacity15: '#06234315',
    primaryDarkestOpacity20: '#06234320',
    primaryDarkestOpacity40: '#06234340',
    primaryDarkestOpacity60: '#06234360',
    primaryDarkestOpacity80: '#06234380',

    backgroundPrimary: '#F2F5F9',
    backgroundSecondary: '#ADD1F9',

    neutralSurface: '#7C869D',
    neutralSurfaceOpacity10: '#7C869D10',
    neutralSurfaceOpacity15: '#7C869D15',
    neutralSurfaceOpacity20: '#8E8E9320',
    neutralSurfaceOpacity40: '#7C869D40',
    neutralSurfaceOpacity60: '#7C869D60',
    neutralSurfaceOpacity80: '#7C869D80',

    success: '#008000',
    successOpacity10: '#00800010',
    successOpacity15: '#00800015',
    successOpacity20: '#00800020',
    successOpacity40: '#00800040',
    successOpacity60: '#00800060',
    successOpacity80: '#00800080',

    warning: '#FFA500',
    warningOpacity10: '#FFA50010',
    warningOpacity15: '#FFA50015',
    warningOpacity20: '#FFA50020',
    warningOpacity40: '#FFA50040',
    warningOpacity60: '#FFA50060',
    warningOpacity80: '#FFA50080',

    info: '#1EA3E5',
    infoOpacity10: '#1EA3E510',
    infoOpacity15: '#1EA3E515',
    infoOpacity20: '#1EA3E520',
    infoOpacity40: '#1EA3E540',
    infoOpacity60: '#1EA3E560',
    infoOpacity80: '#1EA3E580',

    destructive: '#D9314D',
    destructiveOpacity10: '#D9314D10',
    destructiveOpacity15: '#D9314D15',
    destructiveOpacity20: '#D9314D20',
    destructiveOpacity40: '#D9314D40',
    destructiveOpacity60: '#D9314D60',
    destructiveOpacity80: '#D9314D80',

    text: '#000000',
    black: '#000000',
    white: '#FFFFFF',
  },
  dark: {
    primary: '#1EA3E5',
    primaryOpacity10: '#1EA3E510',
    primaryOpacity15: '#1EA3E515',
    primaryOpacity20: '#1EA3E520',
    primaryOpacity40: '#1EA3E540',
    primaryOpacity60: '#1EA3E560',
    primaryOpacity80: '#1EA3E580',

    primaryDarker: '#0854AA',
    primaryDarkerOpacity10: '#0854AA10',
    primaryDarkerOpacity15: '#0854AA15',
    primaryDarkerOpacity20: '#0854AA20',
    primaryDarkerOpacity40: '#276A8A40',
    primaryDarkerOpacity60: '#0854AA60',
    primaryDarkerOpacity80: '#0854AA80',

    primaryDarkest: '#062343',
    primaryDarkestOpacity10: '#06234310',
    primaryDarkestOpacity15: '#06234315',
    primaryDarkestOpacity20: '#06234320',
    primaryDarkestOpacity40: '#06234340',
    primaryDarkestOpacity60: '#06234360',
    primaryDarkestOpacity80: '#06234380',

    backgroundPrimary: '#05080E',
    backgroundSecondary: '#062343',

    neutralSurface: '#7C869D',
    neutralSurfaceOpacity10: '#7C869D10',
    neutralSurfaceOpacity15: '#7C869D15',
    neutralSurfaceOpacity20: '#8E8E9320',
    neutralSurfaceOpacity40: '#7C869D40',
    neutralSurfaceOpacity60: '#7C869D60',
    neutralSurfaceOpacity80: '#7C869D80',

    success: '#008000',
    successOpacity10: '#00800010',
    successOpacity15: '#00800015',
    successOpacity20: '#00800020',
    successOpacity40: '#00800040',
    successOpacity60: '#00800060',
    successOpacity80: '#00800080',

    warning: '#FFA500',
    warningOpacity10: '#FFA50010',
    warningOpacity15: '#FFA50015',
    warningOpacity20: '#FFA50020',
    warningOpacity40: '#FFA50040',
    warningOpacity60: '#FFA50060',
    warningOpacity80: '#FFA50080',

    info: '#1EA3E5',
    infoOpacity10: '#1EA3E510',
    infoOpacity15: '#1EA3E515',
    infoOpacity20: '#1EA3E520',
    infoOpacity40: '#1EA3E540',
    infoOpacity60: '#1EA3E560',
    infoOpacity80: '#1EA3E580',

    destructive: '#D9314D',
    destructiveOpacity10: '#D9314D10',
    destructiveOpacity15: '#D9314D15',
    destructiveOpacity20: '#D9314D20',
    destructiveOpacity40: '#D9314D40',
    destructiveOpacity60: '#D9314D60',
    destructiveOpacity80: '#D9314D80',

    text: '#FFFFFF',
    black: '#000000',
    white: '#FFFFFF',
  },
} as const;

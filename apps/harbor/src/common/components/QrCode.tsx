import { Atoms, useTheme, Spacing } from '@/src/common/theme';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

type QrCodeProps = {
  // Encoded payload; renders a blank placeholder of the same size while null.
  value: string | null;
  size: number;
  variant?: 'black' | 'harbor-gradient';
};

export function QrCode({ value, size, variant = 'black' }: QrCodeProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        Atoms.items_center,
        Atoms.justify_center,
        Atoms.rounded_lg,
        Atoms.overflow_hidden,
        { backgroundColor: theme.palette.white },
      ]}
    >
      {value ? (
        <QRCode
          value={value}
          size={size}
          color={theme.palette.black}
          backgroundColor="transparent"
          quietZone={Spacing.lg}
          {...(variant === 'harbor-gradient' && {
            enableLinearGradient: true,
            gradientDirection: ['0%', '0%', '0%', '100%'],
            linearGradient: [
              theme.palette.primary_100,
              theme.palette.primary_500,
            ],
          })}
        />
      ) : (
        <View style={{ width: size, height: size }} />
      )}
    </View>
  );
}

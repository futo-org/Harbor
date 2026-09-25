import { Atoms, useTheme } from '@/src/common/theme';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

type QrCodeProps = {
  // Encoded payload; renders a blank placeholder of the same size while null.
  value: string | null;
  size: number;
};

/** Black-on-white QR code in a rounded card, legible in both themes. */
export function QrCode({ value, size }: QrCodeProps) {
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
          backgroundColor={theme.palette.white}
          quietZone={32}
        />
      ) : (
        <View style={{ width: size, height: size }} />
      )}
    </View>
  );
}

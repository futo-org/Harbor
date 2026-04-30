import { LinkButton, Text } from '@/src/common/components';
import { Atoms, useTheme } from '@/src/common/theme';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { PairIdentityManualEntry } from './PairIdentityManualEntry';

export interface PairIdentityCameraProps {
  onCodeScanned: (code: string, server: string | null) => void;
  parseInput: (text: string) => { server: string | null; code: string };
}

export function PairIdentityCamera({
  onCodeScanned,
  parseInput,
}: PairIdentityCameraProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [input, setInput] = useState('');
  const { theme } = useTheme();
  const scannedRef = useRef(false);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (scannedRef.current) return;
      const qrCode = codes[0];
      if (qrCode?.value) {
        scannedRef.current = true;
        const { code, server } = parseInput(qrCode.value);
        onCodeScanned(code, server);
      }
    },
  });

  useEffect(() => {
    if (!hasPermission && cameraEnabled) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission, cameraEnabled]);

  const handleContinue = () => {
    if (!input.trim()) return;
    const { code, server } = parseInput(input);
    onCodeScanned(code, server);
  };

  const canUseCamera = hasPermission && cameraEnabled && device !== undefined;

  return (
    <>
      {canUseCamera && device ? (
        <>
          <Text variant="body" color="neutral_500">
            On your other device, go to Settings {'->'} Pair Identity.
          </Text>
          <View
            style={[
              Atoms.flex_1,
              Atoms.rounded_md,
              {
                overflow: 'hidden',
                backgroundColor: theme.palette.neutral_900,
              },
            ]}
          >
            <Camera
              device={device}
              isActive={true}
              codeScanner={codeScanner}
              style={{ flex: 1 }}
            />
          </View>
          <LinkButton
            title="Can't scan? Enter code manually"
            onPress={() => setCameraEnabled(false)}
            variant="small"
            underlineOnHover
          />
        </>
      ) : (
        <>
          <PairIdentityManualEntry
            input={input}
            setInput={setInput}
            onContinue={handleContinue}
          />

          {device !== undefined && (
            <LinkButton
              title="Use camera instead"
              onPress={() => {
                setCameraEnabled(true);
                scannedRef.current = false;
              }}
              variant="small"
              underlineOnHover
            />
          )}
        </>
      )}
    </>
  );
}

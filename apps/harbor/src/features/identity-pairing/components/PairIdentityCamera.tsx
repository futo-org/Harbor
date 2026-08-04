import { LinkButton, Text } from '@/src/common/components';
import { Atoms, useTheme } from '@/src/common/theme';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Camera,
  isScannedCode,
  useCameraDevice,
  useCameraPermission,
  useObjectOutput,
} from 'react-native-vision-camera';
import { PairIdentityManualEntry } from './PairIdentityManualEntry';

export interface PairIdentityCameraProps {
  onCodeScanned: (pairingCode: string) => void;
}

export function PairIdentityCamera({ onCodeScanned }: PairIdentityCameraProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [input, setInput] = useState('');
  const { theme } = useTheme();
  const scannedRef = useRef(false);

  const objectOutput = useObjectOutput({
    types: ['qr'],
    onObjectsScanned: (objects) => {
      if (scannedRef.current) return;
      const qrCode = objects.find(isScannedCode);
      if (qrCode?.value) {
        scannedRef.current = true;
        onCodeScanned(qrCode.value);
      }
    },
  });

  useEffect(() => {
    if (!hasPermission && cameraEnabled) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission, cameraEnabled]);

  const handleContinue = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onCodeScanned(trimmed);
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
              outputs={[objectOutput]}
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

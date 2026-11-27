import { LinkButton, Text } from '@/src/common/components/primitives';
import { Atoms, useTheme } from '@/src/common/theme';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import {
  PAIRING_SCAN_COPY,
  type PairIdentityCameraComponent,
} from './PairIdentityCamera.types';
import { PairIdentityManualEntry } from './PairIdentityManualEntry';
import { useQrCodeOutput } from './useQrCodeOutput';

export const PairIdentityCamera: PairIdentityCameraComponent = ({
  onCodeScanned,
  copy = PAIRING_SCAN_COPY,
}) => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [input, setInput] = useState('');
  const { theme } = useTheme();
  const scannedRef = useRef(false);

  const qrCodeOutput = useQrCodeOutput(
    (value) => {
      if (scannedRef.current) return;

      scannedRef.current = true;
      onCodeScanned(value);
    },
    () => setCameraEnabled(false),
  );

  useEffect(() => {
    if (!hasPermission && cameraEnabled) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission, cameraEnabled]);

  const handleContinue = () => {
    if (!input.trim()) return;
    onCodeScanned(input);
  };

  const canUseCamera = hasPermission && cameraEnabled && device !== undefined;

  return (
    <>
      {canUseCamera && device ? (
        <>
          <Text variant="body" color="muted">
            {copy.hint}
          </Text>
          <View
            style={[
              Atoms.flex_1,
              Atoms.rounded_md,
              {
                overflow: 'hidden',
                backgroundColor: theme.colors.dark,
              },
            ]}
          >
            <Camera
              device={device}
              isActive={true}
              outputs={[qrCodeOutput]}
              style={{ flex: 1 }}
            />
          </View>
          <LinkButton
            title="Can't scan? Paste link manually"
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
            copy={copy}
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
};

import {
  type CameraOutput,
  isScannedCode,
  type ScannedObjectType,
  useObjectOutput,
} from 'react-native-vision-camera';
import type { UseQrCodeOutput } from './useQrCodeOutput.types';

// Stable reference so the output is not destroyed and recreated on every render.
const QR_CODE_TYPES: ScannedObjectType[] = ['qr'];

// iOS uses VisionCamera's Apple-native object output instead of MLKit,
// so the app does not link MLKit on iOS. Apple's output has no error
// callback, so `onError` is never called here.
export const useQrCodeOutput: UseQrCodeOutput = (onValue): CameraOutput =>
  useObjectOutput({
    types: QR_CODE_TYPES,
    onObjectsScanned: (objects) => {
      const value = objects.find(isScannedCode)?.value;
      if (value) onValue(value);
    },
  });

import type { CameraOutput } from 'react-native-vision-camera';
import {
  type TargetBarcodeFormat,
  useBarcodeScannerOutput,
} from 'react-native-vision-camera-barcode-scanner';
import type { UseQrCodeOutput } from './useQrCodeOutput.types';

// Stable reference so the scanner is not destroyed and recreated on every render.
const QR_CODE_FORMATS: TargetBarcodeFormat[] = ['qr-code'];

// Android scans with MLKit via react-native-vision-camera-barcode-scanner.
// VisionCamera's object output is iOS-only.
export const useQrCodeOutput: UseQrCodeOutput = (
  onValue,
  onError,
): CameraOutput =>
  useBarcodeScannerOutput({
    barcodeFormats: QR_CODE_FORMATS,
    onBarcodeScanned: (barcodes) => {
      const value = barcodes.find((barcode) => barcode.rawValue)?.rawValue;
      if (value) onValue(value);
    },
    onError: () => onError?.(),
  });

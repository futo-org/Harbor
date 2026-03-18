import { useState, useCallback } from 'react';
import { useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { useCameraPermission } from './useCameraPermission';

export type QRScanResult =
  | { type: 'text'; data: string }
  | { type: 'json'; data: unknown };

export interface UseQRScannerOptions {
  parseJSON?: boolean;
  onScan?: (result: QRScanResult) => void;
  onError?: (error: Error) => void;
}

export interface UseQRScannerReturn {
  device: ReturnType<typeof useCameraDevice>;
  hasPermission: boolean | null;
  isLoading: boolean;
  requestPermission: () => Promise<boolean>;
  isActive: boolean;
  setIsActive: (active: boolean) => void;
  scannedData: QRScanResult | null;
  codeScanner: ReturnType<typeof useCodeScanner>;
}

export function useQRScanner(
  options: UseQRScannerOptions = {},
): UseQRScannerReturn {
  const { parseJSON = false, onScan, onError } = options;

  const { hasPermission, isLoading, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [isActive, setIsActive] = useState(false);
  const [scannedData, setScannedData] = useState<QRScanResult | null>(null);

  const parseQRData = useCallback(
    (rawData: string): QRScanResult => {
      if (!parseJSON) {
        return { type: 'text', data: rawData };
      }

      try {
        const parsed = JSON.parse(rawData);
        return { type: 'json', data: parsed };
      } catch {
        return { type: 'text', data: rawData };
      }
    },
    [parseJSON],
  );

  const handleCodeScanned = useCallback(
    (codes: any[]) => {
      if (codes.length === 0) return;

      const code = codes[0];
      const rawValue = code.value;

      if (!rawValue) return;

      try {
        const result = parseQRData(rawValue);
        setScannedData(result);

        if (onScan) {
          onScan(result);
        }

        setIsActive(false);
      } catch (error) {
        const err =
          error instanceof Error
            ? error
            : new Error('Failed to process QR code');
        if (onError) {
          onError(err);
        }
      }
    },
    [parseQRData, onScan, onError],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: handleCodeScanned,
  });

  return {
    device,
    hasPermission,
    isLoading,
    requestPermission,
    isActive,
    setIsActive,
    scannedData,
    codeScanner,
  };
}

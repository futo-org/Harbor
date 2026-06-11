import { useState, useCallback } from 'react';
import {
  isScannedCode,
  useCameraDevice,
  useObjectOutput,
} from 'react-native-vision-camera';
import type { ScannedObject } from 'react-native-vision-camera';
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
  requestPermission: () => Promise<boolean>;
  isActive: boolean;
  setIsActive: (active: boolean) => void;
  scannedData: QRScanResult | null;
  objectOutput: ReturnType<typeof useObjectOutput>;
}

export function useQRScanner(
  options: UseQRScannerOptions = {},
): UseQRScannerReturn {
  const { parseJSON = false, onScan, onError } = options;

  const { hasPermission, requestPermission } = useCameraPermission();
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

  const handleObjectsScanned = useCallback(
    (objects: ScannedObject[]) => {
      const code = objects.find(isScannedCode);
      const rawValue = code?.value;

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

  const objectOutput = useObjectOutput({
    types: ['qr'],
    onObjectsScanned: handleObjectsScanned,
  });

  return {
    device,
    hasPermission,
    requestPermission,
    isActive,
    setIsActive,
    scannedData,
    objectOutput,
  };
}

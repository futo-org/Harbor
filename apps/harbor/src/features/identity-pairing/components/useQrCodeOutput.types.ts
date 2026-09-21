import type { CameraOutput } from 'react-native-vision-camera';

/**
 * Returns a camera output that scans QR codes and reports each decoded
 * value through `onValue`. `onError` is called when the scanner fails
 * and the camera should be hidden; not every platform can report errors.
 */
export type UseQrCodeOutput = (
  onValue: (value: string) => void,
  onError?: () => void,
) => CameraOutput;

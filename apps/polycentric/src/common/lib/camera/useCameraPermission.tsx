import { useCameraPermission as useVisionCameraPermission } from 'react-native-vision-camera';

export interface UseCameraPermissionReturn {
  hasPermission: boolean | null;
  isLoading: boolean;
  requestPermission: () => Promise<boolean>;
  canRequestPermission: boolean;
}

export function useCameraPermission(): UseCameraPermissionReturn {
  const { hasPermission, requestPermission, canRequestPermission } =
    useVisionCameraPermission();

  return {
    hasPermission,
    isLoading: false,
    requestPermission,
    canRequestPermission,
  };
}

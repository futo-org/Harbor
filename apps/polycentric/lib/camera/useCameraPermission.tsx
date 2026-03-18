import { useState, useEffect } from 'react';
import { Camera } from 'react-native-vision-camera';

export interface UseCameraPermissionReturn {
  hasPermission: boolean | null;
  isLoading: boolean;
  requestPermission: () => Promise<boolean>;
  checkPermission: () => void;
}

export function useCameraPermission(): UseCameraPermissionReturn {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkPermission = () => {
    try {
      const status = Camera.getCameraPermissionStatus();
      setHasPermission(status === 'granted');
    } catch (error) {
      console.error('Error checking camera permission:', error);
      setHasPermission(false);
    } finally {
      setIsLoading(false);
    }
  };

  const requestPermission = async (): Promise<boolean> => {
    try {
      const status = await Camera.requestCameraPermission();
      const granted = status === 'granted';
      setHasPermission(granted);
      return granted;
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      setHasPermission(false);
      return false;
    }
  };

  useEffect(() => {
    checkPermission();
  }, []);

  return {
    hasPermission,
    isLoading,
    requestPermission,
    checkPermission,
  };
}

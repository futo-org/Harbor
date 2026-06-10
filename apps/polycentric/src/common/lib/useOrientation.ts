import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Tracks the device's current screen orientation
 */
export function useOrientation(): ScreenOrientation.Orientation {
  const [orientation, setOrientation] = useState<ScreenOrientation.Orientation>(
    ScreenOrientation.Orientation.PORTRAIT_UP,
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let active = true;
    void ScreenOrientation.getOrientationAsync().then((current) => {
      if (active) setOrientation(current);
    });

    const subscription = ScreenOrientation.addOrientationChangeListener(
      (event) => {
        console.log(event);
        setOrientation(event.orientationInfo.orientation);
      },
    );

    return () => {
      active = false;
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  return orientation;
}

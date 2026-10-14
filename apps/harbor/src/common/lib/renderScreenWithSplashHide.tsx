import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

// On slow starts native screens attach and draw long after the JS commit. An
// image only displays once its view is drawn, so hiding the splash then never
// fades it into a blank screen.
export function renderScreenWithSplashHide({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <Image
        source={{
          // 1×1 transparent PNG, inlined so it displays without any I/O.
          uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        }}
        style={styles.splashHidePixel}
        onDisplay={() => {
          void SplashScreen.hideAsync().catch(() => {});
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  splashHidePixel: { position: 'absolute', width: 1, height: 1 },
});

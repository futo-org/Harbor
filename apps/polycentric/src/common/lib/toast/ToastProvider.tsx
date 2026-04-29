import { WEB_MAX_CONTENT_WIDTH } from '@/src/common/constants';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { Toasts } from './ToastConfig';

const styles = StyleSheet.create({
  provider: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  contentColumn: {
    width: '100%',
    maxWidth: WEB_MAX_CONTENT_WIDTH,
    minWidth: 0,
  },
  toastLayerZ: {
    zIndex: 100,
  },
});

type ToastProviderProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentColumn?: boolean;
};

export function ToastProvider({
  children,
  style,
  contentColumn = false,
}: ToastProviderProps) {
  return (
    <View
      style={[styles.provider, contentColumn && styles.contentColumn, style]}
    >
      {children}
      <View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, styles.toastLayerZ]}
      >
        <Toasts />
      </View>
    </View>
  );
}

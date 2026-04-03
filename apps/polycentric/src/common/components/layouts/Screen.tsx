import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import {
  Background,
  type BackgroundProps,
} from '@/src/common/components/primitives/Background';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemo } from 'react';

interface ScreenProps {
  children: React.ReactNode;
  background?: BackgroundProps;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  keyboardAvoiding?: boolean;
}

export function Screen({
  children,
  background = { gradient: 'top' },
  edges = ['top', 'bottom'],
  keyboardAvoiding = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const padding = useMemo(
    () => ({
      paddingTop: edges.includes('top') ? insets.top : 0,
      paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
      paddingLeft: edges.includes('left') ? insets.left : 0,
      paddingRight: edges.includes('right') ? insets.right : 0,
    }),
    [insets, edges],
  );

  const content = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.bottom}
    >
      {children}
    </KeyboardAvoidingView>
  ) : (
    children
  );

  return (
    <View style={[styles.container, padding]}>
      <Background {...background} />
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flex: {
    flex: 1,
  },
});

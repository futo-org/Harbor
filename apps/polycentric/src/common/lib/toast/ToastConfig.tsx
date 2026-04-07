import { View, StyleSheet, Pressable, Keyboard } from 'react-native';
import { Text } from '@/src/common/components/primitives';
import { useTheme, withHexOpacity, BorderRadius } from '@/src/common/theme';
import { isWeb } from '@/src/common/util/platform';
import { BlurView } from 'expo-blur';
import Toast, { ToastConfigParams } from 'react-native-toast-message';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { TAB_BAR_HEIGHT } from '@/src/common/constants';

const WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  text1?: string;
  text2?: string;
  type: ToastType;
  onPress?: () => void;
}

function ToastContent({ text1, text2, type, onPress }: ToastProps) {
  const { theme } = useTheme();
  const isDark = theme.scheme === 'dark';
  const borderColor = (() => {
    switch (type) {
      case 'success':
        return withHexOpacity(theme.palette.positive_500, '80');
      case 'error':
        return withHexOpacity(theme.palette.negative_500, '80');
      case 'info':
        return withHexOpacity(theme.palette.primary_500, '80');
      case 'warning':
        return withHexOpacity(theme.palette.warning_500, '80');
    }
  })();

  return (
    <Pressable onPress={onPress} style={styles.pressable}>
      <BlurView
        intensity={80}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.container,
          {
            borderRadius: BorderRadius.md,
            borderColor,
          },
        ]}
      >
        <View style={styles.content}>
          {text1 && (
            <Text variant="body" fontWeight="semibold">
              {text1}
            </Text>
          )}
          {text2 && (
            <Text variant="secondary" color="neutral_500">
              {text2}
            </Text>
          )}
        </View>
      </BlurView>
    </Pressable>
  );
}

export const toastConfig = {
  success: (props: ToastConfigParams<unknown>) => (
    <ToastContent
      text1={props.text1}
      text2={props.text2}
      type="success"
      onPress={props.onPress}
    />
  ),
  error: (props: ToastConfigParams<unknown>) => (
    <ToastContent
      text1={props.text1}
      text2={props.text2}
      type="error"
      onPress={props.onPress}
    />
  ),
  info: (props: ToastConfigParams<unknown>) => (
    <ToastContent
      text1={props.text1}
      text2={props.text2}
      type="info"
      onPress={props.onPress}
    />
  ),
  warning: (props: ToastConfigParams<unknown>) => (
    <ToastContent
      text1={props.text1}
      text2={props.text2}
      type="warning"
      onPress={props.onPress}
    />
  ),
};

function ToastsBody({ insets }: { insets: EdgeInsets }) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Only add tab bar offset when keyboard is hidden (library handles keyboard positioning)
  const bottomOffset = keyboardVisible
    ? 0
    : TAB_BAR_HEIGHT + insets.bottom + 16;

  return (
    <Toast config={toastConfig} position="bottom" bottomOffset={bottomOffset} />
  );
}

function NativeToasts() {
  const insets = useSafeAreaInsets();
  return <ToastsBody insets={insets} />;
}

export function Toasts() {
  if (isWeb) {
    return <ToastsBody insets={WEB_INSETS} />;
  }
  return <NativeToasts />;
}

const styles = StyleSheet.create({
  pressable: {
    width: '90%',
  },
  container: {
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  content: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 2,
  },
});

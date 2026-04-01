import { View, StyleSheet, Pressable, Keyboard } from 'react-native';
import { Text } from '@/components/primitives';
import { useLegacyTheme, ColorToken } from '@/legacyTheme';
import { BlurView } from 'expo-blur';
import Toast, { ToastConfigParams } from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { TAB_BAR_HEIGHT } from '@/constants';

type ToastType = 'success' | 'error' | 'info' | 'warning';

const typeBorderColors: Record<ToastType, ColorToken> = {
  success: 'successOpacity80',
  error: 'destructiveOpacity80',
  info: 'infoOpacity80',
  warning: 'warningOpacity80',
};

interface ToastProps {
  text1?: string;
  text2?: string;
  type: ToastType;
  onPress?: () => void;
}

function ToastContent({ text1, text2, type, onPress }: ToastProps) {
  const { legacyTheme, legacyIsDark } = useLegacyTheme();
  const borderColor = legacyTheme.colors[typeBorderColors[type]];

  return (
    <Pressable onPress={onPress} style={styles.pressable}>
      <BlurView
        intensity={80}
        tint={legacyIsDark ? 'dark' : 'light'}
        style={[
          styles.container,
          {
            borderRadius: legacyTheme.borderRadius.md,
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
            <Text variant="secondary" color="neutralSurface">
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

export function Toasts() {
  const insets = useSafeAreaInsets();
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

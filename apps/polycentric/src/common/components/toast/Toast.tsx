import { Text } from '@/src/common/components';
import Icon, { IconName } from '@/src/common/components/Icon';
import {
  Atoms,
  BorderRadius,
  PaletteColorToken,
  useTheme,
} from '@/src/common/theme';
import * as ToastPrimitive from '@rn-primitives/toast';
import { useCallback, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { ToastData, ToastVariant, useToastStore } from './useToastStore';

const ENTER_MS = 220;
const EXIT_MS = 160;

const VARIANTS: Record<
  ToastVariant,
  { icon: IconName; color: PaletteColorToken }
> = {
  info: { icon: 'notification', color: 'primary_500' },
  success: { icon: 'checkmarkCircle', color: 'positive_500' },
  error: { icon: 'ban', color: 'negative_500' },
  warning: { icon: 'flag', color: 'warning_500' },
};

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};

export function Toast({ toast }: { toast: ToastData }) {
  const { theme } = useTheme();
  const dismiss = useToastStore((s) => s.dismiss);
  const progress = useSharedValue(0);
  const variant = VARIANTS[toast.variant];

  const close = useCallback(() => {
    progress.value = withTiming(0, { duration: EXIT_MS }, (finished) => {
      if (finished) runOnJS(dismiss)(toast.id);
    });
  }, [progress, dismiss, toast.id]);

  useEffect(() => {
    progress.value = withTiming(1, { duration: ENTER_MS });
    if (toast.duration === null) return;
    const timer = setTimeout(close, toast.duration);
    return () => clearTimeout(timer);
  }, [progress, close, toast.duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    // Drop down from above on enter, lift back up on exit.
    transform: [{ translateY: (progress.value - 1) * 16 }],
  }));

  return (
    <Animated.View layout={LinearTransition} style={animatedStyle}>
      <ToastPrimitive.Root
        open
        onOpenChange={(next) => {
          if (!next) close();
        }}
        style={[
          Atoms.flex_row,
          Atoms.items_center,
          Atoms.gap_sm,
          Atoms.p_lg,
          {
            borderRadius: BorderRadius.full,
            backgroundColor: theme.palette.neutral_0,
            borderWidth: 1,
            borderColor: theme.palette.neutral_50,
            ...shadow,
          },
        ]}
      >
        <Icon name={variant.icon} color={variant.color} size={20} />
        <View style={Atoms.flex_1}>
          <ToastPrimitive.Title asChild>
            <Text variant="body" fontWeight="semibold" style={theme.atoms.text}>
              {toast.title}
            </Text>
          </ToastPrimitive.Title>
          {toast.description ? (
            <ToastPrimitive.Description asChild>
              <Text variant="small" style={theme.atoms.text_neutral_medium}>
                {toast.description}
              </Text>
            </ToastPrimitive.Description>
          ) : null}
        </View>
        <ToastPrimitive.Close asChild>
          <Pressable hitSlop={8}>
            <Icon name="close" color="neutral_500" size={18} />
          </Pressable>
        </ToastPrimitive.Close>
      </ToastPrimitive.Root>
    </Animated.View>
  );
}

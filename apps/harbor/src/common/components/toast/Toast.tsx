import { Text } from '@/src/common/components/primitives';
import Icon, { type IconName } from '@/src/common/components/Icon';
import {
  Atoms,
  BorderRadius,
  type TextColor,
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
import {
  type ToastData,
  type ToastVariant,
  useToastStore,
} from './useToastStore';

const ENTER_MS = 220;
const EXIT_MS = 160;

const VARIANTS: Record<ToastVariant, { icon: IconName; color: TextColor }> = {
  info: { icon: 'notification', color: 'accent' },
  success: { icon: 'checkmarkCircle', color: 'success' },
  error: { icon: 'ban', color: 'danger' },
  warning: { icon: 'flag', color: 'warning' },
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

  // Define `content` and `bodyStyle` so that they can be reused for
  // pressable and non-pressable toasts
  const content = (
    <>
      <Icon name={variant.icon} color={variant.color} size={20} />
      <View style={Atoms.flex_1}>
        <ToastPrimitive.Title asChild>
          <Text variant="body" fontWeight="semibold">
            {toast.title}
          </Text>
        </ToastPrimitive.Title>
        {toast.description ? (
          <ToastPrimitive.Description asChild>
            <Text variant="small" color="secondary">
              {toast.description}
            </Text>
          </ToastPrimitive.Description>
        ) : null}
      </View>
    </>
  );
  const bodyStyle = [
    Atoms.flex_1,
    Atoms.flex_row,
    Atoms.items_center,
    Atoms.gap_sm,
    Atoms.py_lg,
    Atoms.pl_lg,
    Atoms.pr_sm,
  ];

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
          theme.atoms_new.box.primary.bg,
          theme.atoms_new.box.primary.border,
          theme.atoms_new.shadow.neutral,
          { borderRadius: BorderRadius.full, borderWidth: 1 },
        ]}
      >
        {toast.onPress ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              toast.onPress?.();
              close();
            }}
            style={bodyStyle}
          >
            {content}
          </Pressable>
        ) : (
          <View style={bodyStyle}>{content}</View>
        )}
        <ToastPrimitive.Close asChild>
          <Pressable hitSlop={8} style={[Atoms.py_lg, Atoms.pr_lg]}>
            <Icon name="close" color="muted" size={18} />
          </Pressable>
        </ToastPrimitive.Close>
      </ToastPrimitive.Root>
    </Animated.View>
  );
}

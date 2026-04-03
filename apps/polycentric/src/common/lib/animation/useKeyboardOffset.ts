import { useEffect } from 'react';
import { Keyboard, Platform } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface UseKeyboardOffsetOptions {
  extraOffset?: number;
}

/**
 * Returns an animated style that translates content up when the keyboard is visible.
 * Use this to keep buttons or inputs visible above the keyboard.
 *
 * @example
 * const { animatedStyle } = useKeyboardOffset();
 * <Animated.View style={animatedStyle}>
 *   <Button title="Continue" />
 * </Animated.View>
 */
export function useKeyboardOffset(options: UseKeyboardOffsetOptions = {}) {
  const { extraOffset = 0 } = options;
  const keyboardHeight = useSharedValue(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      keyboardHeight.value = withTiming(e.endCoordinates.height + extraOffset, {
        duration: Platform.OS === 'ios' ? 250 : 200,
        easing: Easing.out(Easing.ease),
      });
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardHeight.value = withTiming(0, {
        duration: Platform.OS === 'ios' ? 250 : 200,
        easing: Easing.out(Easing.ease),
      });
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [extraOffset, keyboardHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboardHeight.value }],
  }));

  return {
    animatedStyle,
    keyboardHeight,
  };
}

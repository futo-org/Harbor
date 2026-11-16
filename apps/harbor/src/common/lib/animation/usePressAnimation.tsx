import { useRef } from 'react';
import { Animated } from 'react-native';
import { Opacity } from '@/src/common/theme';

const PRESS_ANIMATION_DURATION_MS = 150;

export function usePressAnimation() {
  const opacity = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.timing(opacity, {
      toValue: Opacity.faded_subtle,
      duration: PRESS_ANIMATION_DURATION_MS,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: PRESS_ANIMATION_DURATION_MS,
      useNativeDriver: true,
    }).start();
  };

  const animatedStyle = { opacity };

  return { animatedStyle, onPressIn, onPressOut };
}

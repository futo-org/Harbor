import { useRef } from 'react';
import { Animated } from 'react-native';

type UsePressAnimationOptions = {
  pressedOpacity?: number;
  duration?: number;
};

export function usePressAnimation({
  pressedOpacity = 0.7,
  duration = 150,
}: UsePressAnimationOptions = {}) {
  const opacity = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.timing(opacity, {
      toValue: pressedOpacity,
      duration,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    }).start();
  };

  const animatedStyle = { opacity };

  return { animatedStyle, onPressIn, onPressOut };
}

import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

type UseFadeInOptions = {
  duration?: number;
  delay?: number;
};

export function useFadeIn({
  duration = 150,
  delay = 0,
}: UseFadeInOptions = {}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      delay,
      useNativeDriver: true,
    }).start();
  }, [opacity, duration, delay]);

  const animatedStyle = { opacity };

  return { animatedStyle };
}

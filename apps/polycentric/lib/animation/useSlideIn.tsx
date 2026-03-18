import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

type SlideDirection = 'up' | 'down' | 'left' | 'right';

type UseSlideInOptions = {
  direction?: SlideDirection;
  distance?: number;
  duration?: number;
  delay?: number;
};

export function useSlideIn({
  direction = 'up',
  distance = 100,
  duration = 300,
  delay = 0,
}: UseSlideInOptions = {}) {
  const translateValue = useRef(new Animated.Value(distance)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateValue, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [translateValue, opacity, duration, delay]);

  const getTransform = () => {
    switch (direction) {
      case 'up':
        return { translateY: translateValue };
      case 'down':
        return { translateY: Animated.multiply(translateValue, -1) };
      case 'left':
        return { translateX: translateValue };
      case 'right':
        return { translateX: Animated.multiply(translateValue, -1) };
    }
  };

  const animatedStyle = {
    opacity,
    transform: [getTransform()],
  };

  return { animatedStyle };
}

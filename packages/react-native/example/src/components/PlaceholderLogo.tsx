import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { images } from '../../assets';
import { COLORS } from '../colors';

export function PlaceholderLogo() {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      <Animated.Image
        source={images.iconForeground}
        style={[styles.icon, { transform: [{ scale: pulseAnim }] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  icon: {
    width: 64,
    height: 64,
    opacity: 0.5,
  },
});

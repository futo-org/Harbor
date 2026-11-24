import { useWindowDimensions } from 'react-native';

const MAX_WIDTH = 300;

export function useNavDrawerWidth() {
  const { width } = useWindowDimensions();
  return Math.min(MAX_WIDTH, width * 0.85);
}

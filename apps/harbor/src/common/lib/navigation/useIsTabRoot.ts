import { useSegments } from 'expo-router';

export function useIsTabRoot(): boolean {
  const segments = useSegments();
  return segments[0] === '(tabs)' && segments.length === 2;
}

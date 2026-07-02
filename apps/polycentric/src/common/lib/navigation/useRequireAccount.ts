import { useEffect } from 'react';
import { router } from 'expo-router';
import { usePolycentricContext } from '@/src/common/lib/polycentric-hooks/PolycentricProvider';

export function useRequireAccount(enabled = true): void {
  const { currentIdentity, isReady } = usePolycentricContext();

  useEffect(() => {
    if (!enabled || !isReady || currentIdentity) return;
    router.replace('/');
  }, [enabled, isReady, currentIdentity]);
}

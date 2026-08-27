import {
  useEffect,
  useRef,
  type DependencyList,
  type EffectCallback,
} from 'react';

/**
 * `useEffect` that skips the mount-time run and fires only when `deps`
 * change afterwards. Cleanups still run as usual.
 *
 * Dependency arrays at call sites are validated by biome's
 * `useExhaustiveDependencies` (registered in biome.json).
 */
export function useUpdateEffect(effect: EffectCallback, deps: DependencyList) {
  const firstTime = useRef(true);

  useEffect(() => {
    if (firstTime.current) {
      firstTime.current = false;
      return;
    }

    return effect();
    // biome-ignore lint/correctness/useExhaustiveDependencies: forwards the caller's deps, which are validated at the call site
  }, deps);
}

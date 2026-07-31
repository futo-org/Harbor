import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useSettings } from '@/src/common/settings';

export type LinkPreviewsContextValue = {
  /** Whether to generate a link preview for URLs in the user's own posts. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

export const Context = createContext<LinkPreviewsContextValue | undefined>(
  undefined,
);
Context.displayName = 'PolycentricLinkPreviewsContext';

export function LinkPreviewsProvider({ children }: PropsWithChildren) {
  const stored = useSettings((s) => s.linkPreviewsEnabled);
  const [hydrated, setHydrated] = useState(useSettings.persist.hasHydrated());

  useEffect(() => {
    const unsub = useSettings.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    return unsub;
  }, []);

  const enabled = hydrated ? stored : true;
  const setEnabled = useCallback((next: boolean) => {
    useSettings.getState().setLinkPreviewsEnabled(next);
  }, []);

  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLinkPreviews() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error('useLinkPreviews must be used within LinkPreviewsProvider');
  }
  return ctx;
}

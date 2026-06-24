import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { loadLinkPreviewsEnabled, saveLinkPreviewsEnabled } from './storage';

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
  // Default on: matches the prior always-generate behavior. Unlike the theme
  // provider we don't block render until the stored value loads — a brief
  // default-on before hydration is harmless (it only affects composing a post,
  // not the initial paint).
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    void loadLinkPreviewsEnabled().then((stored) => {
      if (stored !== undefined) {
        setEnabledState(stored);
      }
    });
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    void saveLinkPreviewsEnabled(next);
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

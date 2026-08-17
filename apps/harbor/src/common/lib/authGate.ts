import { create } from 'zustand';

type AuthGateState = {
  /** Mirrored so non-React callers can gate too. */
  hasIdentity: boolean;
  /** Whether the signup prompt is on screen. */
  visible: boolean;
  setHasIdentity: (hasIdentity: boolean) => void;
  hide: () => void;
};

export const useAuthGateStore = create<AuthGateState>((set) => ({
  hasIdentity: false,
  visible: false,

  setHasIdentity: (hasIdentity) => set({ hasIdentity }),
  hide: () => set({ visible: false }),
}));

/** Resolves with an identity; otherwise prompts to join and rejects. */
export function requireIdentity(): Promise<void> {
  if (useAuthGateStore.getState().hasIdentity) return Promise.resolve();
  useAuthGateStore.setState({ visible: true });
  return Promise.reject();
}

/** Runs `action` behind {@link requireIdentity}; a prompt drops it. */
export function withIdentity(action: () => unknown): void {
  requireIdentity().then(action, () => {});
}

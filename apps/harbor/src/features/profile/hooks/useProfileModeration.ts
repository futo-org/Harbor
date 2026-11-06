import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { usePostModeration } from '@/src/features/post/hooks/usePostModeration';
import { create } from 'zustand';
import { useProfile } from './useProfile';

type RevealedState = {
  /** Identities shown despite a warn label, this session. */
  revealed: Set<string>;
  setRevealed: (identity: string, revealed: boolean) => void;
};

const useRevealed = create<RevealedState>((set) => ({
  revealed: new Set(),
  setRevealed: (identity, revealed) =>
    set((s) => {
      const next = new Set(s.revealed);
      if (revealed) next.add(identity);
      else next.delete(identity);
      return { revealed: next };
    }),
}));

/** Whether a profile's name and avatar are hidden behind its warn labels. */
export function useProfileModeration(identity: string | null | undefined): {
  obscured: boolean;
  revealed: boolean;
  warnLabels: PostLabel[];
  reveal: () => void;
  hide: () => void;
} {
  const { hasWarnContent, warnLabels } = usePostModeration(
    useProfile(identity).labels,
  );
  const revealed = useRevealed((s) => !!identity && s.revealed.has(identity));
  const setRevealed = useRevealed((s) => s.setRevealed);
  return {
    obscured: hasWarnContent && !revealed,
    revealed: hasWarnContent && revealed,
    warnLabels,
    reveal: () => {
      if (identity) setRevealed(identity, true);
    },
    hide: () => {
      if (identity) setRevealed(identity, false);
    },
  };
}

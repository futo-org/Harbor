import type { PostLabel } from '@/src/common/lib/polycentric-hooks/helpers';
import { create } from 'zustand';

export type ModerationWarningRequest = {
  labels: PostLabel[];
  /** The labelled identity, or the post's author, for self-applied labels. */
  identity: string | null;
  subject: 'profile' | 'post';
  onConfirm: () => void;
};

/** Drives the root-mounted `ModerationWarningSheet`. */
export const useModerationWarningStore = create<{
  /** Kept after closing so the native dismiss animation has content. */
  request: ModerationWarningRequest | null;
  open: boolean;
  openFor: (request: ModerationWarningRequest) => void;
  close: () => void;
}>((set) => ({
  request: null,
  open: false,
  openFor: (request) => set({ request, open: true }),
  close: () => set({ open: false }),
}));

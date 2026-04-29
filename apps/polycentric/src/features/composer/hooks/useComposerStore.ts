import { create } from 'zustand';

export type ComposerAttachment = {
  id: string;
  uri: string;
  width: number;
  height: number;
};

type ComposerState = {
  text: string;
  attachments: ComposerAttachment[];
  submitting: boolean;
  error: string | null;
};

type ComposerActions = {
  setText: (text: string) => void;
  addAttachments: (additions: ComposerAttachment[]) => void;
  removeAttachment: (id: string) => void;
  setSubmitting: (value: boolean) => void;
  setError: (error: string | null) => void;
  /** Clear text, attachments, and error. Keeps no draft. */
  reset: () => void;
};

const initialState: ComposerState = {
  text: '',
  attachments: [],
  submitting: false,
  error: null,
};

export const useComposerStore = create<ComposerState & ComposerActions>(
  (set) => ({
    ...initialState,
    setText: (text) => set({ text }),
    addAttachments: (additions) =>
      set((s) => ({ attachments: [...s.attachments, ...additions] })),
    removeAttachment: (id) =>
      set((s) => ({
        attachments: s.attachments.filter((a) => a.id !== id),
      })),
    setSubmitting: (submitting) => set({ submitting }),
    setError: (error) => set({ error }),
    reset: () => set(initialState),
  }),
);

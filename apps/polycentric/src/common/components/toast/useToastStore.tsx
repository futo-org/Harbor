import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';

export interface ToastData {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  // Auto-dismiss delay in ms; null keeps it up until dismissed.
  duration: number | null;
}

export interface ToastOptions {
  description?: string;
  variant?: ToastVariant;
  duration?: number | null;
}

const MAX_VISIBLE = 4;
const DEFAULT_DURATION = 4000;

interface ToastStore {
  toasts: ToastData[];
  show: (title: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

let nextId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (title, options = {}) => {
    const id = `toast-${(nextId += 1)}`;
    const toast: ToastData = {
      id,
      title,
      description: options.description,
      variant: options.variant ?? 'info',
      duration:
        options.duration === undefined ? DEFAULT_DURATION : options.duration,
    };
    // Drop the oldest once the stack is full.
    set((s) => ({ toasts: [...s.toasts, toast].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  dismissAll: () => set({ toasts: [] }),
}));

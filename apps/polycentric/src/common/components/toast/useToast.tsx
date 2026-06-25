import { ToastOptions, ToastVariant, useToastStore } from './useToastStore';

function trigger(variant: ToastVariant) {
  return (title: string, options?: ToastOptions) =>
    useToastStore.getState().show(title, { ...options, variant });
}

// Imperative API usable outside of components (event handlers, async flows).
export const toast = {
  show: (title: string, options?: ToastOptions) =>
    useToastStore.getState().show(title, options),
  info: trigger('info'),
  success: trigger('success'),
  error: trigger('error'),
  warning: trigger('warning'),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  dismissAll: () => useToastStore.getState().dismissAll(),
};

// Hook form for components; the triggers are stable and read live store state.
export function useToast() {
  return toast;
}

import Toast from 'react-native-toast-message';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  duration?: number;
  onPress?: () => void;
  onHide?: () => void;
}

const show = (
  type: ToastType,
  message: string,
  description?: string,
  options?: ToastOptions,
) => {
  Toast.show({
    type,
    text1: message,
    text2: description,
    visibilityTime: options?.duration ?? 3000,
    onPress: options?.onPress,
    onHide: options?.onHide,
  });
};

export const toast = {
  success: (message: string, description?: string, options?: ToastOptions) =>
    show('success', message, description, options),

  error: (message: string, description?: string, options?: ToastOptions) =>
    show('error', message, description, options),

  info: (message: string, description?: string, options?: ToastOptions) =>
    show('info', message, description, options),

  warning: (message: string, description?: string, options?: ToastOptions) =>
    show('warning', message, description, options),

  hide: () => Toast.hide(),
};

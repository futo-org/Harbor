import { Alert, type AlertButton, Platform } from 'react-native';

interface AlertOptions {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  cancelable?: boolean;
}

function isWeb(): boolean {
  return Platform.OS === 'web';
}

function formatAlertMessage(title: string, message?: string): string {
  return [title, message].filter(Boolean).join('\n\n');
}

/**
 * shows a native alert
 */
export function showAlert(options: AlertOptions): Promise<number> {
  return new Promise((resolve) => {
    const buttons: AlertButton[] = options.buttons || [
      {
        text: 'OK',
        onPress: () => resolve(0),
      },
    ];

    // wrap button onPress to resolve with index
    const wrappedButtons = buttons.map((button, index) => ({
      ...button,
      onPress: () => {
        button.onPress?.();
        resolve(index);
      },
    }));

    if (isWeb()) {
      const msg = formatAlertMessage(options.title, options.message);
      if (wrappedButtons.length <= 1) {
        window.alert(msg);
        wrappedButtons[0]?.onPress?.();
        return;
      }
      if (wrappedButtons.length === 2) {
        const ok = window.confirm(msg);
        (ok ? wrappedButtons[1] : wrappedButtons[0]).onPress?.();
        return;
      }
      window.alert(
        `${msg}\n\n${wrappedButtons.map((b) => b.text).join(' | ')}`,
      );
      wrappedButtons[0].onPress?.();
      return;
    }

    Alert.alert(options.title, options.message, wrappedButtons, {
      cancelable: options.cancelable ?? true,
    });
  });
}

/**
 * shows a confirmation dialog
 */
export function confirm(options: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}): Promise<boolean> {
  return new Promise((resolve) => {
    if (isWeb()) {
      const msg = formatAlertMessage(options.title, options.message);
      const ok = window.confirm(msg);
      void (async () => {
        try {
          if (ok) {
            await options.onConfirm?.();
            resolve(true);
          } else {
            await options.onCancel?.();
            resolve(false);
          }
        } catch {
          resolve(false);
        }
      })();
      return;
    }

    Alert.alert(
      options.title,
      options.message,
      [
        {
          text: options.cancelText || 'Cancel',
          style: 'cancel',
          onPress: async () => {
            await options.onCancel?.();
            resolve(false);
          },
        },
        {
          text: options.confirmText || 'Confirm',
          style: 'default',
          onPress: async () => {
            await options.onConfirm?.();
            resolve(true);
          },
        },
      ],
      { cancelable: true },
    );
  });
}

/**
 * shows a destructive confirmation
 */
export function confirmDelete(options: {
  itemName: string;
  title?: string;
  message?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}): Promise<boolean> {
  return confirm({
    title: options.title || 'Delete',
    message:
      options.message ||
      `Are you sure you want to delete ${options.itemName}? This action cannot be undone.`,
    confirmText: 'Delete',
    onConfirm: options.onConfirm,
    onCancel: options.onCancel,
  });
}

/**
 * shows an info alert
 */
export function showInfo(options: {
  title: string;
  message: string;
  onDismiss?: () => void;
}): Promise<void> {
  return new Promise((resolve) => {
    if (isWeb()) {
      window.alert(formatAlertMessage(options.title, options.message));
      options.onDismiss?.();
      resolve();
      return;
    }

    Alert.alert(
      options.title,
      options.message,
      [
        {
          text: 'OK',
          onPress: () => {
            options.onDismiss?.();
            resolve();
          },
        },
      ],
      { cancelable: true },
    );
  });
}

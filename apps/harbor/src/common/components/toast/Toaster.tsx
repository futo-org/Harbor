import { Atoms, Breakpoints, Spacing, ZIndex } from '@/src/common/theme';
import { isIOS } from '@/src/common/util/platform';
import { Portal } from '@rn-primitives/portal';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { Toast } from './Toast';
import { useToastStore } from './useToastStore';

// iOS presents native sheets above the React root, out of zIndex's reach,
// so toasts need a separate UIWindow there. iOS-only; no-op elsewhere.
function ToastLayer({ children }: { children: ReactNode }) {
  if (isIOS) return <FullWindowOverlay>{children}</FullWindowOverlay>;
  return <Portal name="toaster">{children}</Portal>;
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <ToastLayer>
      <View
        pointerEvents="box-none"
        style={[
          Atoms.absolute,
          Atoms.inset_0,
          Atoms.justify_start,
          Atoms.px_lg,
          Atoms.gap_sm,
          { maxWidth: Breakpoints.sm },
          { margin: 'auto' },
          // Above modals so toasts never hide behind open sheets.
          { zIndex: ZIndex.toast },
          // Safe-area inset is dynamic, so it stays out of the Atoms list.
          { paddingTop: insets.top + Spacing.sm },
        ]}
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} />
        ))}
      </View>
    </ToastLayer>
  );
}

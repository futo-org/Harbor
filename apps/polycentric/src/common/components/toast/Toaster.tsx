import { Atoms, Spacing } from '@/src/common/theme';
import { Portal } from '@rn-primitives/portal';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Toast } from './Toast';
import { useToastStore } from './useToastStore';

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <Portal name="toaster">
      <View
        pointerEvents="box-none"
        style={[
          Atoms.absolute,
          Atoms.inset_0,
          Atoms.justify_start,
          Atoms.px_lg,
          Atoms.gap_sm,
          // Safe-area inset is dynamic, so it stays out of the Atoms list.
          { paddingTop: insets.top + Spacing.sm },
        ]}
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} />
        ))}
      </View>
    </Portal>
  );
}

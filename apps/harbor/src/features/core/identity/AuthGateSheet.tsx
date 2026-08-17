import { Sheet } from '@/src/common/components/sheet';
import { useAuthGateStore } from '@/src/common/lib/authGate';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { Atoms } from '@/src/common/theme';
import { useEffect } from 'react';
import { SignupWidget } from './SignupWidget';

/** Mounted at the root; opened by `common/lib/authGate`. */
export function AuthGateSheet() {
  const { hasIdentity } = useCurrentIdentity();
  const visible = useAuthGateStore((s) => s.visible);
  const hide = useAuthGateStore((s) => s.hide);

  useEffect(() => {
    useAuthGateStore.getState().setHasIdentity(hasIdentity);
  }, [hasIdentity]);

  return (
    <Sheet open={visible} onClose={hide} detents={[0.6]} maxWidth={500}>
      <Sheet.Content style={Atoms.p_0}>
        <SignupWidget onAction={hide} />
      </Sheet.Content>
    </Sheet>
  );
}

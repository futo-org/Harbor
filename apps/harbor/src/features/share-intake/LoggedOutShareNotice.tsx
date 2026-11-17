import { toast } from '@/src/common/components/toast';
import { useCurrentIdentity } from '@/src/common/lib/polycentric-hooks';
import { useEffect } from 'react';
import { usePendingShareStore } from './usePendingShareStore';

/**
 * Drops a share that arrives while logged out, with a toast. The share's
 * route is account-only, so the visitor lands on onboarding (native) or
 * explore (web) and has to share again after logging in.
 */
export function LoggedOutShareNotice() {
  const { hasIdentity } = useCurrentIdentity();
  const hasPendingShare = usePendingShareStore(
    (state) => state.pendingShare !== null,
  );

  useEffect(() => {
    if (hasIdentity || !hasPendingShare) return;
    toast.info('Sign up or log in to post');
    usePendingShareStore.getState().clearPendingShare();
  }, [hasIdentity, hasPendingShare]);

  return null;
}

import { useEffect } from 'react';
import { canSelfUpdate, checkForUpdate } from './checkForUpdate';
import { UpdateSheet } from './UpdateSheet';

// Let startup (feed fan-out, first paint) settle before touching the network.
const AUTO_CHECK_DELAY_MS = 5000;

/** Launch update check + the update sheet. Sideloaded Android builds only. */
export function AppUpdater() {
  useEffect(() => {
    const timer = setTimeout(
      () => void checkForUpdate({ manual: false }),
      AUTO_CHECK_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  if (!canSelfUpdate()) return null;
  return <UpdateSheet />;
}

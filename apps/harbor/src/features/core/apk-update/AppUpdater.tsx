import { isAndroid } from '@/src/common/util/platform';
import { useEffect } from 'react';
import { checkForUpdate } from './checkForUpdate';
import { UpdateSheet } from './UpdateSheet';

// Let startup (feed fan-out, first paint) settle before touching the network.
const AUTO_CHECK_DELAY_MS = 5000;

/** Launch update check + the update sheet. Android only. */
export function AppUpdater() {
  useEffect(() => {
    const timer = setTimeout(
      () => void checkForUpdate({ manual: false }),
      AUTO_CHECK_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  if (!isAndroid) return null;
  return <UpdateSheet />;
}

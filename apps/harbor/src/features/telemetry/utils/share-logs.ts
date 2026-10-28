import { toast } from '@/src/common/components/toast';
import { isWeb } from '@/src/common/util/platform';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import type { LogEntry } from '../hooks/useLogStore';
import { formatLogs } from './format';

const TITLE = 'Harbor logs';

export async function shareLogs(entries: LogEntry[]): Promise<void> {
  const text = formatLogs(entries);
  if (isWeb) {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: TITLE, text });
        return;
      } catch {}
    }
    await Clipboard.setStringAsync(text);
    toast.success('Logs copied to clipboard');
    return;
  }
  try {
    await Share.share({ title: TITLE, message: text });
  } catch {
    toast.error('Could not open the share sheet');
  }
}

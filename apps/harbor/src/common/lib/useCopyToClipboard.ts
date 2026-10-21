import { toast } from '@/src/common/components/toast';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';

const COPIED_INDICATOR_DURATION_MS = 2000;

export function useCopyToClipboard({ showToast = false } = {}) {
  const [justCopied, setJustCopied] = useState<boolean>(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => () => clearTimeout(resetTimeoutRef.current), []);

  const copyToClipboard = useCallback(
    (value: string) => {
      void Clipboard.setStringAsync(value);
      if (showToast) toast.success('Copied to clipboard');
      setJustCopied(true);
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(
        () => setJustCopied(false),
        COPIED_INDICATOR_DURATION_MS,
      );
    },
    [showToast],
  );

  return { copyToClipboard, justCopied };
}

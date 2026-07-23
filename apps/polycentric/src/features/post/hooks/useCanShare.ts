import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';

let canShare: boolean | undefined;

export default function useCanShare(): boolean {
  const [available, setAvailable] = useState(canShare ?? false);
  useEffect(() => {
    if (canShare !== undefined) return;
    let alive = true;
    Sharing.isAvailableAsync()
      .then((result) => {
        canShare = result;
        if (alive) setAvailable(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

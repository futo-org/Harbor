import { Routes } from '@/src/common/constants';
import { takeIncomingShare } from '@/src/features/share-intake/takeIncomingShare';
import * as Linking from 'expo-linking';

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  // expo-sharing opens the app with `<scheme>://expo-sharing` after a share
  if (Linking.parse(path).hostname === 'expo-sharing') {
    void takeIncomingShare(initial ? 'cold' : 'warm');
    return Routes.shareDebug;
  }
  return path;
}

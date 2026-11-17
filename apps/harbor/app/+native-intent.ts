import { Routes } from '@/src/common/constants';
import { takeIncomingShare } from '@/src/features/share-intake/takeIncomingShare';
import * as Linking from 'expo-linking';

export function redirectSystemPath({ path }: { path: string }): string {
  // expo-sharing opens the app with `<scheme>://expo-sharing` after a share
  if (Linking.parse(path).hostname === 'expo-sharing') {
    void takeIncomingShare();
    return Routes.tabs.feed.compose;
  }
  return path;
}

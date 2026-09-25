import { isAndroid } from '@/src/common/util/platform';
import { Share } from 'react-native';

/** Opens the system share sheet (navigator.share on web) for a URL.
 * RN Share, since expo-sharing only shares local files on Android. */
export function nativeShareUrl(url: string) {
  // Android only reads `message`; iOS and web take `url`.
  void Share.share(isAndroid ? { message: url } : { url }).catch(() => {});
}

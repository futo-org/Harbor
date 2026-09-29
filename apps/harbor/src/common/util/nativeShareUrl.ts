import { isAndroid, isWeb } from '@/src/common/util/platform';
import { Share } from 'react-native';

export const canShareUrl =
  !isWeb || (typeof navigator !== 'undefined' && !!navigator.share);

export function nativeShareUrl(url: string) {
  void Share.share(isAndroid ? { message: url } : { url }).catch(() => {});
}

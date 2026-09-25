import { isAndroid } from '@/src/common/util/platform';
import { Share } from 'react-native';

export function nativeShareUrl(url: string) {
  void Share.share(isAndroid ? { message: url } : { url }).catch(() => {});
}

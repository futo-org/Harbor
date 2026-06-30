import { Image as ExpoImage, type ImageProps } from 'expo-image';
import { useFallbackUri } from './useFallbackUri';

export type { ImageProps };

type Props = Omit<ImageProps, 'source' | 'onError'> & {
  /** URLs tried in order; falls through to the next on load failure. */
  uris: string[];
};

/** expo-image that retries the next URL when one fails to load. */
export function Image({ uris, recyclingKey, ...rest }: Props) {
  const { uri, onError } = useFallbackUri(uris);
  return (
    <ExpoImage
      {...rest}
      source={uri ? { uri } : undefined}
      recyclingKey={recyclingKey ?? uris[0]}
      onError={onError}
    />
  );
}

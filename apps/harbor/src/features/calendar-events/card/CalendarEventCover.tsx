import Icon from '@/src/common/components/Icon';
import { Image } from '@/src/common/components/Image';
import { resolveImageSources } from '@/src/common/components/ImageViewer';
import { usePolycentric } from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme } from '@/src/common/theme';
import type { v2 } from '@polycentric/react-native-sdk';
import { useMemo } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

type CalendarEventCoverProps = {
  image: v2.ImageSet | undefined;
  /** Width used to pick the image variant */
  targetSize: number;
  style?: StyleProp<ViewStyle>;
};

/** Event cover photo, or a placeholder if there isn't one */
export function CalendarEventCover({
  image,
  targetSize,
  style,
}: CalendarEventCoverProps) {
  const { theme } = useTheme();
  const client = usePolycentric();

  const source = useMemo(
    () =>
      image
        ? resolveImageSources(
            [image],
            (digest) => client.blobUrls(digest),
            targetSize,
          )[0]
        : undefined,
    [client, image, targetSize],
  );

  return (
    <View
      style={[
        Atoms.overflow_hidden,
        Atoms.items_center,
        Atoms.justify_center,
        theme.atoms.box.raised.bg,
        style,
      ]}
    >
      {source ? (
        <Image
          uris={source.uris}
          contentFit="cover"
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <Icon
          name="calendar"
          // Bigger icon for bigger covers
          size={Math.max(24, Math.min(64, targetSize / 12))}
          color="muted"
        />
      )}
    </View>
  );
}

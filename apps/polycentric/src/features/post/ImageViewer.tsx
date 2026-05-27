import { Text } from '@/src/common/components/primitives';
import {
  pickImageVariant,
  usePolycentric,
} from '@/src/common/lib/polycentric-hooks';
import { Atoms, useTheme, withHexOpacity } from '@/src/common/theme';
import Icon from '@/src/common/components/Icon';
import { v2 } from '@polycentric/react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, Platform, Pressable, View } from 'react-native';

/** Pull the largest available variant for the viewer. */
const VIEWER_TARGET = 2048;

type ViewerSource = {
  uri: string;
  aspectRatio: number;
};

/**
 * Full-screen image viewer for post attachments. Tap the backdrop or
 * the close button to dismiss; left/right arrows (and keyboard arrows
 * on web) navigate between images when there's more than one.
 */
export function ImageViewer({
  images,
  initialIndex,
  onClose,
}: {
  images: v2.ImageSet[];
  initialIndex: number;
  onClose: () => void;
}) {
  const client = usePolycentric();
  const { theme } = useTheme();

  const sources = useMemo<ViewerSource[]>(
    () =>
      images
        .map((imageSet) => {
          const variant = pickImageVariant(imageSet, VIEWER_TARGET);
          const digest = variant?.blob?.digest;
          if (!digest) return null;
          const uri = client.blobUrl(digest);
          if (!uri) return null;
          const w = variant.width || 1;
          const h = variant.height || 1;
          return { uri, aspectRatio: w / h };
        })
        .filter((s): s is ViewerSource => s != null),
    [client, images],
  );

  const [index, setIndex] = useState(initialIndex);
  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIndex((i) => Math.min(sources.length - 1, i + 1)),
    [sources.length],
  );

  // Web: Esc closes, arrow keys navigate.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goPrev, goNext]);

  if (sources.length === 0) return null;
  const safeIndex = Math.min(index, sources.length - 1);
  const current = sources[safeIndex];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < sources.length - 1;

  const chipBg = withHexOpacity(theme.palette.black, 'b0');

  return (
    <Modal visible transparent onRequestClose={onClose} animationType="fade">
      <Pressable
        onPress={onClose}
        style={[
          Atoms.flex_1,
          Atoms.items_center,
          Atoms.justify_center,
          { backgroundColor: 'rgba(0,0,0,0.92)' },
        ]}
      >
        {/* Swallow taps on the image so they don't dismiss. */}
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={[
            Atoms.items_center,
            Atoms.justify_center,
            { width: '92%', height: '88%' },
          ]}
        >
          <Image
            source={{ uri: current.uri }}
            resizeMode="contain"
            style={[
              Atoms.w_full,
              Atoms.h_full,
              { aspectRatio: current.aspectRatio },
            ]}
          />
        </Pressable>

        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onClose();
          }}
          accessibilityLabel="Close image viewer"
          hitSlop={12}
          style={[
            Atoms.absolute,
            Atoms.items_center,
            Atoms.justify_center,
            Atoms.rounded_full,
            {
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              backgroundColor: chipBg,
            },
          ]}
        >
          <Icon name="close" size={24} color="white" />
        </Pressable>

        {hasPrev && <NavArrow side="left" onPress={goPrev} bg={chipBg} />}
        {hasNext && <NavArrow side="right" onPress={goNext} bg={chipBg} />}

        {sources.length > 1 && (
          <View
            pointerEvents="none"
            style={[
              Atoms.absolute,
              Atoms.items_center,
              { top: 20, left: 0, right: 0 },
            ]}
          >
            <View
              style={[
                Atoms.px_sm,
                Atoms.py_xs,
                Atoms.rounded_lg,
                { backgroundColor: chipBg },
              ]}
            >
              <Text variant="small" style={{ color: theme.palette.white }}>
                {safeIndex + 1} / {sources.length}
              </Text>
            </View>
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

function NavArrow({
  side,
  onPress,
  bg,
}: {
  side: 'left' | 'right';
  onPress: () => void;
  bg: string;
}) {
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        onPress();
      }}
      hitSlop={12}
      accessibilityLabel={side === 'left' ? 'Previous image' : 'Next image'}
      style={[
        Atoms.absolute,
        Atoms.items_center,
        Atoms.justify_center,
        Atoms.rounded_full,
        {
          top: '50%',
          width: 44,
          height: 44,
          transform: [{ translateY: -22 }],
          backgroundColor: bg,
        },
        side === 'left' ? { left: 16 } : { right: 16 },
      ]}
    >
      <Icon
        name={side === 'left' ? 'chevronBack' : 'chevronForward'}
        size={28}
        color="white"
      />
    </Pressable>
  );
}

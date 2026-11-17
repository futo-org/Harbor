import Icon from '@/src/common/components/Icon';
import { singleImageAspectRatio } from '@/src/common/lib/images/attachmentLayout';
import type { ImageAttachment } from '@/src/common/lib/images/useImageAttachments';
import {
  Atoms,
  createThemedStyles,
  Spacing,
  withHexOpacity,
} from '@/src/common/theme';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

const ATTACHMENT_GAP = Spacing.sm;

/**
 * Lays out 1–4 attachments: a single image spans the full width at its natural
 * (clamped) aspect ratio, while two or more wrap into a 50%-width square grid
 * (two per row → 2-up, 3+1, or 2x2).
 */
export function AttachmentGrid({
  attachments,
  disabled,
  onRemoveAttachment,
}: {
  attachments: ImageAttachment[];
  disabled: boolean;
  onRemoveAttachment: (id: string) => void;
}) {
  const styles = useStyles();
  const [containerWidth, setContainerWidth] = useState(0);
  const single = attachments.length === 1;

  const onLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  // Two columns: each item is half the row minus half the inter-item gap.
  const gridItemWidth = containerWidth
    ? (containerWidth - ATTACHMENT_GAP) / 2
    : undefined;

  return (
    <View onLayout={onLayout} style={styles.grid}>
      {/* Wait for the measured width: thumbs first rendered without it will stay at height 0 in Safari. */}
      {(single || containerWidth > 0) &&
        attachments.map((a) => (
          <AttachmentThumb
            key={a.id}
            uri={a.uri}
            status={a.status}
            width={single ? '100%' : gridItemWidth}
            aspectRatio={single ? singleImageAspectRatio(a) : 1}
            disabled={disabled}
            onRemove={() => onRemoveAttachment(a.id)}
          />
        ))}
    </View>
  );
}

function AttachmentThumb({
  uri,
  disabled,
  onRemove,
  width,
  aspectRatio,
  status,
}: {
  uri: string;
  disabled: boolean;
  onRemove: () => void;
  width?: number | '100%';
  aspectRatio: number;
  status: ImageAttachment['status'];
}) {
  const styles = useStyles();
  return (
    <View style={[styles.thumb, { width, aspectRatio }]}>
      <Image
        source={{ uri }}
        recyclingKey={uri}
        contentFit="cover"
        style={styles.thumbImage}
      />

      {/* Loading / error overlay while the blobs are being processed+uploaded */}
      {status !== 'ready' && (
        <View
          style={[
            styles.statusOverlay,
            status === 'error'
              ? styles.statusOverlayError
              : styles.statusOverlayProcessing,
          ]}
        >
          {status === 'error' ? (
            <Icon name="ban" size={22} color="white" />
          ) : (
            <ActivityIndicator size="small" color="white" />
          )}
        </View>
      )}
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        accessibilityLabel="Remove attachment"
        hitSlop={6}
        style={[styles.removeButton, disabled && styles.removeButtonDisabled]}
      >
        <Icon name="close" size={14} color="white" />
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((theme, define) =>
  define({
    grid: [
      Atoms.flex_row,
      Atoms.flex_wrap,
      Atoms.mt_sm,
      { gap: ATTACHMENT_GAP },
    ],
    thumb: [Atoms.rounded_md, Atoms.overflow_hidden, theme.atoms.bg_neutral_25],
    thumbImage: [Atoms.w_full, Atoms.h_full],
    statusOverlay: [
      StyleSheet.absoluteFill,
      Atoms.items_center,
      Atoms.justify_center,
    ],
    statusOverlayProcessing: {
      backgroundColor: withHexOpacity(theme.palette.black, '40'),
    },
    statusOverlayError: {
      backgroundColor: withHexOpacity(theme.palette.negative_500, '40'),
    },
    removeButton: [
      Atoms.absolute,
      Atoms.rounded_full,
      Atoms.items_center,
      Atoms.justify_center,
      {
        top: 2,
        right: 2,
        width: 22,
        height: 22,
        backgroundColor: withHexOpacity(theme.palette.black, 'b0'),
      },
    ],
    removeButtonDisabled: { opacity: 0.4 },
  }),
);

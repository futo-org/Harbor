import { toast } from '@/src/common/components/toast';
import { readImageDimensions } from '@/src/common/lib/images/loadBoundedImage';
import { Atoms, createThemedStyles } from '@/src/common/theme';
import { type FileWithPath, fromEvent } from 'file-selector';
import { type RefObject, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { StyleSheet, View } from 'react-native';

type DroppedImage = { uri: string; width: number; height: number };

export function ImageDropOverlay({
  onDrop,
  remainingSlots,
  disabled = false,
}: {
  onDrop: (images: DroppedImage[]) => void;
  remainingSlots: number;
  disabled?: boolean;
}) {
  const styles = useStyles();

  const attachImageFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      if (files.length > remainingSlots) {
        toast.info(
          remainingSlots === 1
            ? 'Only the first image was added'
            : `Only the first ${remainingSlots} images were added`,
        );
      }
      onDrop(
        await Promise.all(files.slice(0, remainingSlots).map(readDroppedImage)),
      );
    },
    [onDrop, remainingSlots],
  );

  const { getRootProps, isDragActive, isDragGlobal, rootRef } = useDropzone({
    accept: { 'image/*': [] },
    disabled,
    noKeyboard: true,
    onDropAccepted: (files) => void attachImageFiles(files),
  });

  useAttachPastedImages(rootRef, attachImageFiles, disabled);

  const isVisible = isDragGlobal && !disabled;

  return (
    <div
      {...getRootProps({
        style: {
          position: 'absolute',
          inset: 0,
          display: 'flex',
          pointerEvents: isVisible ? 'auto' : 'none',
        },
      })}
    >
      {isVisible && (
        <>
          <View style={styles.backdrop} />
          <View
            style={[styles.dropArea, isDragActive && styles.dropAreaActive]}
          />
        </>
      )}
    </div>
  );
}

// A paste lands on the focused input, a sibling of the overlay, so listen on
// the container they share.
function useAttachPastedImages(
  overlayRef: RefObject<HTMLElement | null>,
  attachImageFiles: (files: File[]) => Promise<void>,
  disabled: boolean,
) {
  useEffect(() => {
    const container = overlayRef.current?.parentElement;
    if (!container || disabled) return;

    const handlePaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      if (!items.some((item) => item.kind === 'file')) return;
      // Keeps the input from also pasting the file's name as text.
      event.preventDefault();
      void fromEvent(event).then((files) =>
        attachImageFiles(
          files.filter(
            (file): file is FileWithPath =>
              file instanceof File && file.type.startsWith('image/'),
          ),
        ),
      );
    };

    container.addEventListener('paste', handlePaste);
    return () => container.removeEventListener('paste', handlePaste);
  }, [overlayRef, attachImageFiles, disabled]);
}

async function readDroppedImage(file: File): Promise<DroppedImage> {
  const uri = URL.createObjectURL(file);
  // Like the web image picker: an image the browser can't decode (HEIC
  // outside Safari) gets 0x0 here and fails in `processAndUploadImage`, which
  // shows why.
  const { width, height } = await readImageDimensions(uri).catch(() => ({
    width: 0,
    height: 0,
  }));
  return { uri, width, height };
}

const useStyles = createThemedStyles((theme, define) =>
  define({
    backdrop: [
      StyleSheet.absoluteFill,
      theme.atoms.box.primary.bg,
      Atoms.faded_subtle,
    ],
    dropArea: [
      Atoms.flex_1,
      Atoms.m_sm,
      Atoms.items_center,
      Atoms.justify_center,
      Atoms.rounded_lg,
      theme.atoms.outline_strong,
      { borderWidth: 4, borderStyle: 'dashed' },
    ],
    dropAreaActive: [
      theme.atoms.box.accent.bg_subtle,
      theme.atoms.box.accent.border,
    ],
  }),
);

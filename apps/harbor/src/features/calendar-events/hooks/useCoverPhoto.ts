import {
  type ImageAttachment,
  type ImageAttachmentStatus,
  useImageAttachments,
} from '@/src/common/lib/images/useImageAttachments';
import { useCallback, useState } from 'react';

/** Cover photo for the create form. Max one */
export function useCoverPhoto(
  disabled: boolean,
  setError: (error: string | null) => void,
) {
  const [cover, setCover] = useState<ImageAttachment[]>([]);

  const getAttachments = useCallback(() => cover, [cover]);

  const addAttachments = useCallback((additions: ImageAttachment[]) => {
    setCover((prev) => [...prev, ...additions].slice(0, 1));
  }, []);

  const setAttachmentStatus = useCallback(
    (id: string, status: ImageAttachmentStatus) => {
      setCover((prev) =>
        prev.map((attachment) =>
          attachment.id === id ? { ...attachment, status } : attachment,
        ),
      );
    },
    [],
  );

  const removeAttachment = useCallback((id: string) => {
    setCover((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  const attachments = useImageAttachments({
    getAttachments,
    addAttachments,
    setAttachmentStatus,
    removeAttachment,
    disabled,
    setError,
  });

  return {
    ...attachments,
    cover,
    isUploading: cover.some((attachment) => attachment.status !== 'ready'),
    reset: () => setCover([]),
  };
}

export type CoverPhoto = ReturnType<typeof useCoverPhoto>;

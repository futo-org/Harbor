// Image drag-and-drop and paste are web-only (see ImageDropOverlay.web.tsx).
export function ImageDropOverlay(_props: {
  onDrop: (images: { uri: string; width: number; height: number }[]) => void;
  remainingSlots: number;
  disabled?: boolean;
}) {
  return null;
}

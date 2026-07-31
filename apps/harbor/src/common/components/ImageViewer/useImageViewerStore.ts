import type { v2 } from '@polycentric/react-native';
import { create } from 'zustand';

/** A directly renderable image; aspectRatio defaults to square. */
export type ImageViewerSource = { uri: string; aspectRatio?: number };

/**
 * Anything the viewer can display: a Polycentric `ImageSet` (resolved
 * to the largest blob variant) or a plain URI (e.g. an identicon).
 */
export type ImageViewerInput = v2.ImageSet | ImageViewerSource;

type ImageViewerState = {
  images: ImageViewerInput[];
  index: number;
};

type ImageViewerActions = {
  /** Set the images + starting index for the image-viewer route to read. */
  show: (images: ImageViewerInput[], index: number) => void;
};

export const useImageViewerStore = create<
  ImageViewerState & ImageViewerActions
>((set) => ({
  images: [],
  index: 0,
  show: (images, index) => set({ images, index }),
}));

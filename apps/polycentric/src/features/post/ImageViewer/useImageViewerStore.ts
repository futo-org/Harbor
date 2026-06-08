import { v2 } from '@polycentric/react-native';
import { create } from 'zustand';

type ImageViewerState = {
  images: v2.ImageSet[];
  index: number;
};

type ImageViewerActions = {
  /** Set the images + starting index for the image-viewer route to read. */
  show: (images: v2.ImageSet[], index: number) => void;
};

/**
 * Hands the full-screen image-viewer route the images to display. The
 * viewer is a route (not an inline modal) so it can be a react-native-
 * screens screen with `screenOrientation: 'all'` — letting it rotate to
 * landscape while the rest of the app stays portrait. Data is in-memory
 * rather than route params because `ImageSet` is a protobuf message.
 */
export const useImageViewerStore = create<
  ImageViewerState & ImageViewerActions
>((set) => ({
  images: [],
  index: 0,
  show: (images, index) => set({ images, index }),
}));

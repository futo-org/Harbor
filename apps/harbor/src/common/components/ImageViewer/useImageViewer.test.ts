import * as React from 'react';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { useImageViewer } from './useImageViewer';
import { useImageViewerStore } from './useImageViewerStore';

jest.mock('@polycentric/react-native', () => ({ v2: {} }));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

/** Render the hook in a throwaway component and hand back its callback. */
function renderUseImageViewer() {
  let open!: ReturnType<typeof useImageViewer>;
  function Harness() {
    open = useImageViewer();
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Harness));
  });
  return open;
}

beforeEach(() => {
  jest.clearAllMocks();
  useImageViewerStore.setState({ images: [], index: 0 });
});

describe('useImageViewer', () => {
  it('stores the images and pushes the image-viewer route', () => {
    const open = renderUseImageViewer();
    const images = [{ uri: 'a' }, { uri: 'b' }];

    act(() => open(images, 1));

    expect(useImageViewerStore.getState().images).toBe(images);
    expect(useImageViewerStore.getState().index).toBe(1);
    expect(router.push).toHaveBeenCalledWith('/image-viewer');
  });

  it('defaults the starting index to 0', () => {
    const open = renderUseImageViewer();

    act(() => open([{ uri: 'a' }]));

    expect(useImageViewerStore.getState().index).toBe(0);
  });

  it('does nothing for an empty image list', () => {
    const open = renderUseImageViewer();

    act(() => open([]));

    expect(router.push).not.toHaveBeenCalled();
    expect(useImageViewerStore.getState().images).toEqual([]);
  });
});

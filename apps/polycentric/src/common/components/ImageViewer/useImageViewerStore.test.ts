import { useImageViewerStore } from './useImageViewerStore';

jest.mock('@polycentric/react-native', () => ({ v2: {} }));

// Plain zustand store: drive it via getState()/setState() without React.
const get = () => useImageViewerStore.getState();

beforeEach(() => {
  useImageViewerStore.setState({ images: [], index: 0 });
});

describe('useImageViewerStore', () => {
  it('starts empty at index 0', () => {
    expect(get().images).toEqual([]);
    expect(get().index).toBe(0);
  });

  it('show() sets the images and starting index', () => {
    const images = [{ uri: 'a' }, { uri: 'b' }];
    get().show(images, 1);
    expect(get().images).toBe(images);
    expect(get().index).toBe(1);
  });

  it('show() replaces a previous set entirely', () => {
    get().show([{ uri: 'a' }, { uri: 'b' }], 1);
    get().show([{ uri: 'c' }], 0);
    expect(get().images).toEqual([{ uri: 'c' }]);
    expect(get().index).toBe(0);
  });
});

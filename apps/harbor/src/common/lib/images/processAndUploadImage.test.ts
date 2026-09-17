import { processAndUploadImage } from './processAndUploadImage';
import { ImageUploadError } from './ImageUploadError';

// --- Mocks ----------------------------------------------------------------

// Force the native (expo-file-system) byte-reading path, on Android.
jest.mock('@/src/common/util/platform', () => ({
  isWeb: false,
  isAndroid: true,
}));

// Minimal protobuf factories: just echo the input so we can assert shapes.
jest.mock('@polycentric/react-native', () => ({
  v2: {
    Image: { create: (x: unknown) => ({ ...(x as object) }) },
    ImageSet: { create: (x: unknown) => ({ ...(x as object) }) },
  },
}));

// `new File(uri).arrayBuffer()` -> deterministic bytes derived from the uri so
// each variant's bytes are distinguishable.
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    arrayBuffer: async () => new Uint8Array([uri.length % 256]).buffer,
  })),
}));

// `expo-image` mock: `Image.loadAsync(uri, bounds)` is the bounded decode step
// and resolves to the source ref installed by `mockSource`.
const mockLoadAsync = jest.fn();
jest.mock('expo-image', () => ({
  Image: { loadAsync: (...args: unknown[]) => mockLoadAsync(...args) },
}));

// `expo-image-manipulator` mock. `mockManipulate(source)` returns a chainable
// context that records crop/resize; `renderAsync()` resolves to an image ref
// whose dimensions reflect the recorded ops, and whose `saveAsync()` echoes
// those dimensions back. `SaveFormat.JPEG` must exist as a runtime value.
const mockManipulate = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: (...args: unknown[]) => mockManipulate(...args),
  },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

// --- Helpers --------------------------------------------------------------

/**
 * Install the decode + manipulator mocks for a source of `srcWidth`x`srcHeight`
 * and return the decoded ref. Each manipulator context records its crop/resize
 * and computes the resulting dimensions the same way the real module would.
 */
function mockSource(srcWidth: number, srcHeight: number) {
  const sourceRef = { width: srcWidth, height: srcHeight };
  mockLoadAsync.mockResolvedValue(sourceRef);
  mockManipulate.mockImplementation(() => {
    let crop: { width: number; height: number } | null = null;
    let resize: { width?: number; height?: number } | null = null;

    const context: Record<string, unknown> = {
      crop: jest.fn((rect) => {
        crop = rect;
        return context;
      }),
      resize: jest.fn((size) => {
        resize = size;
        return context;
      }),
      renderAsync: jest.fn(async () => {
        let w = crop ? crop.width : srcWidth;
        let h = crop ? crop.height : srcHeight;
        if (resize) {
          if (resize.width != null && resize.height != null) {
            w = resize.width;
            h = resize.height;
          } else if (resize.width != null) {
            h = Math.round((h * resize.width) / w);
            w = resize.width;
          } else if (resize.height != null) {
            w = Math.round((w * resize.height) / h);
            h = resize.height;
          }
        }
        return {
          width: w,
          height: h,
          saveAsync: jest.fn(async (opts) => ({
            uri: `file://variant-${w}x${h}-${opts.format}.jpg`,
            width: w,
            height: h,
          })),
        };
      }),
    };
    return context;
  });
  return sourceRef;
}

function makeClient() {
  return {
    commitBlob: jest.fn(async (_bytes: Uint8Array, mime: string) => ({
      mime,
    })),
    uploadBlob: jest.fn(async () => undefined),
    // biome-ignore lint/suspicious/noExplicitAny: test mock cast
  } as any;
}

beforeEach(() => {
  mockLoadAsync.mockReset();
  mockManipulate.mockReset();
});

// --- Tests ----------------------------------------------------------------

describe('processAndUploadImage', () => {
  it('emits one variant per requested size and uploads each', async () => {
    mockSource(4000, 3000);
    const client = makeClient();

    const result = await processAndUploadImage(client, 'file://in.heic', {
      mode: 'fit',
      sizes: [512, 1280],
    });

    expect(result.images).toHaveLength(2);
    expect(client.commitBlob).toHaveBeenCalledTimes(2);
    expect(client.uploadBlob).toHaveBeenCalledTimes(2);
    // Every committed blob is JPEG.
    for (const call of client.commitBlob.mock.calls) {
      expect(call[1]).toBe('image/jpeg');
    }
  });

  it('fit mode scales the longest edge to size and preserves aspect ratio', async () => {
    mockSource(4000, 3000); // landscape 4:3
    const client = makeClient();

    const result = await processAndUploadImage(client, 'file://in.jpg', {
      mode: 'fit',
      sizes: [512],
    });

    // Landscape: width is the longest edge -> 512, height scaled to keep 4:3.
    expect(result.images[0].width).toBe(512);
    expect(result.images[0].height).toBe(384);
  });

  it('fit mode resizes by height for portrait images', async () => {
    mockSource(3000, 4000); // portrait 3:4
    const client = makeClient();

    const result = await processAndUploadImage(client, 'file://in.jpg', {
      mode: 'fit',
      sizes: [512],
    });

    expect(result.images[0].height).toBe(512);
    expect(result.images[0].width).toBe(384);
  });

  it('fit mode never upscales a small image', async () => {
    mockSource(100, 80);
    const client = makeClient();

    const result = await processAndUploadImage(client, 'file://small.jpg', {
      mode: 'fit',
      sizes: [512],
    });

    // Longest edge (100) < requested 512, so it stays at the source size.
    expect(result.images[0].width).toBe(100);
    expect(result.images[0].height).toBe(80);
  });

  it('fill mode center-crops to a square then resizes to size x size', async () => {
    mockSource(4000, 3000);
    const client = makeClient();

    // One manipulator context per variant. Capture it to inspect its
    // crop/resize calls.
    const result = await processAndUploadImage(client, 'file://in.jpg', {
      mode: 'fill',
      sizes: [128],
    });

    // Square output.
    expect(result.images[0].width).toBe(128);
    expect(result.images[0].height).toBe(128);

    // The variant context was center-cropped to 3000².
    const variantContext = mockManipulate.mock.results[0].value;
    expect(variantContext.crop).toHaveBeenCalledWith({
      originX: 500, // (4000 - 3000) / 2
      originY: 0,
      width: 3000,
      height: 3000,
    });
    expect(variantContext.resize).toHaveBeenCalledWith({
      width: 128,
      height: 128,
    });
  });

  it('decodes the source once, bounded, and reuses it for every variant', async () => {
    const sourceRef = mockSource(4000, 3000);
    const client = makeClient();

    await processAndUploadImage(client, 'file://in.jpg', {
      mode: 'fit',
      sizes: [512, 1280],
    });

    // The only decode is the bounded one; the original uri never reaches the
    // manipulator.
    expect(mockLoadAsync).toHaveBeenCalledTimes(1);
    expect(mockLoadAsync).toHaveBeenCalledWith('file://in.jpg', {
      maxWidth: 2048,
      maxHeight: 2048,
    });
    expect(mockManipulate).toHaveBeenCalledTimes(2);
    for (const call of mockManipulate.mock.calls) {
      expect(call[0]).toBe(sourceRef);
    }
  });

  it('re-decodes an animated source through the manipulator (first frame)', async () => {
    const sourceRef = mockSource(600, 1300);
    Object.assign(sourceRef, { isAnimated: true });
    const client = makeClient();

    const result = await processAndUploadImage(client, 'file://in.gif', {
      mode: 'fit',
      sizes: [512],
    });

    // The bounded ref is animated, so the manipulator decodes the uri itself
    // and every variant is cut from that render, never from the animated ref.
    expect(mockManipulate.mock.calls[0][0]).toBe('file://in.gif');
    expect(mockManipulate).toHaveBeenCalledTimes(2);
    expect(mockManipulate.mock.calls[1][0]).not.toBe(sourceRef);
    expect(result.images[0].height).toBe(512);
  });

  it('defaults to fill mode and the default variant sizes', async () => {
    mockSource(1000, 1000);
    const client = makeClient();

    const result = await processAndUploadImage(client, 'file://in.jpg');

    // DEFAULT_IMAGE_VARIANT_SIZES = [48, 128, 512]
    expect(result.images).toHaveLength(3);
    expect(result.images.map((i: { width: number }) => i.width)).toEqual([
      48, 128, 512,
    ]);
  });

  it('rejects variant sizes above the decode bound before doing any work', async () => {
    mockSource(4000, 3000);
    const client = makeClient();

    await expect(
      processAndUploadImage(client, 'file://in.jpg', { sizes: [512, 4096] }),
    ).rejects.toThrow('at most 2048px');
    expect(mockLoadAsync).not.toHaveBeenCalled();
    expect(client.commitBlob).not.toHaveBeenCalled();
  });

  it('tags decode failures with the decode stage and keeps the cause', async () => {
    const client = makeClient();
    const cause = new Error('The browser cannot decode this image');
    mockLoadAsync.mockRejectedValue(cause);

    await expectStageFailure(
      processAndUploadImage(client, 'file://in.heic', { sizes: [512] }),
      'decode',
      cause,
    );
  });

  it('tags manipulator failures with the encode stage', async () => {
    mockSource(1000, 1000);
    const client = makeClient();
    // The web manipulator rejects with a bare canvas, not an Error.
    const cause = { tagName: 'CANVAS' };
    mockManipulate.mockImplementation(() => {
      throw cause;
    });

    await expectStageFailure(
      processAndUploadImage(client, 'file://in.jpg', { sizes: [512] }),
      'encode',
      cause,
    );
  });

  it('tags upload failures with the upload stage', async () => {
    mockSource(1000, 1000);
    const client = makeClient();
    const cause = new Error('network down');
    client.uploadBlob.mockRejectedValueOnce(cause);

    await expectStageFailure(
      processAndUploadImage(client, 'file://in.jpg', { sizes: [512] }),
      'upload',
      cause,
    );
  });

  async function expectStageFailure(
    failure: Promise<unknown>,
    stage: ImageUploadError['stage'],
    cause: unknown,
  ) {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(failure).rejects.toBeInstanceOf(ImageUploadError);
    await expect(failure).rejects.toHaveProperty('stage', stage);
    await expect(failure).rejects.toHaveProperty('cause', cause);
  }
});

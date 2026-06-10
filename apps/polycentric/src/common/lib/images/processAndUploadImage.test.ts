import { processAndUploadImage } from './processAndUploadImage';

// --- Mocks ----------------------------------------------------------------

// Force the native (expo-file-system) byte-reading path.
jest.mock('@/src/common/util/platform', () => ({ isWeb: false }));

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
 * Install the manipulator mock for a source of `srcWidth`x`srcHeight`.
 * Records the crop/resize on each created context and computes the resulting
 * dimensions the same way the real native module would.
 */
function mockSource(srcWidth: number, srcHeight: number) {
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
}

function makeClient() {
  return {
    commitBlob: jest.fn(async (_bytes: Uint8Array, mime: string) => ({
      mime,
    })),
    uploadBlob: jest.fn(async () => undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
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

    // The decode context is created first, then one per variant. Capture the
    // variant context to inspect its crop/resize calls.
    const result = await processAndUploadImage(client, 'file://in.jpg', {
      mode: 'fill',
      sizes: [128],
    });

    // Square output.
    expect(result.images[0].width).toBe(128);
    expect(result.images[0].height).toBe(128);

    // The variant context (2nd mockManipulate call) was center-cropped to 3000² .
    const variantContext = mockManipulate.mock.results[1].value;
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

  it('decodes the source once and reuses it for every variant', async () => {
    mockSource(4000, 3000);
    const client = makeClient();

    await processAndUploadImage(client, 'file://in.jpg', {
      mode: 'fit',
      sizes: [512, 1280],
    });

    // 1 decode + 2 variants = 3 mockManipulate() calls.
    expect(mockManipulate).toHaveBeenCalledTimes(3);
    // First call is the decode (by uri); later calls reuse the decoded ref.
    expect(mockManipulate.mock.calls[0][0]).toBe('file://in.jpg');
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

  it('propagates upload failures', async () => {
    mockSource(1000, 1000);
    const client = makeClient();
    client.uploadBlob.mockRejectedValueOnce(new Error('network down'));

    await expect(
      processAndUploadImage(client, 'file://in.jpg', { sizes: [512] }),
    ).rejects.toThrow('network down');
  });
});

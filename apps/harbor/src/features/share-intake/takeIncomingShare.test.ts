import { toast } from '@/src/common/components/toast';
import { MAX_ATTACHMENTS } from '@/src/common/lib/images/useImageAttachments';
import type { SharePayload } from 'expo-sharing';
import { takeIncomingShare } from './takeIncomingShare';
import { usePendingShareStore } from './usePendingShareStore';

// --- Mocks ----------------------------------------------------------------

jest.mock('@/src/common/components/toast', () => ({
  toast: { info: jest.fn(), error: jest.fn() },
}));

// The hook module pulls in the Polycentric client; only the cap is needed
jest.mock('@/src/common/lib/images/useImageAttachments', () => ({
  MAX_ATTACHMENTS: 4,
}));

let mockSharedPayloads: SharePayload[] = [];
const mockClearSharedPayloads = jest.fn();
jest.mock('expo-sharing', () => ({
  getSharedPayloads: () => mockSharedPayloads,
  clearSharedPayloads: () => mockClearSharedPayloads(),
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
  File: jest.fn().mockImplementation((first: unknown, name?: string) => ({
    uri: name ? `file:///cache/shared-images/${name}` : first,
    extension: '.jpg',
    copy: jest.fn(async () => undefined),
    move: jest.fn(async () => undefined),
  })),
}));

// Decodes every image, unless a test makes it reject
const mockLoadAsync = jest.fn(async (_uri: string) => ({
  width: 200,
  height: 100,
  release: jest.fn(),
}));
jest.mock('expo-image', () => ({
  Image: { loadAsync: (uri: string) => mockLoadAsync(uri) },
}));

// --- Helpers --------------------------------------------------------------

function imagePayload(name: string): SharePayload {
  return {
    shareType: 'image',
    value: `content://sender/${name}`,
    mimeType: 'image/jpeg',
  } as SharePayload;
}

function textPayload(value: string, shareType: 'text' | 'url' = 'text') {
  return { shareType, value, mimeType: 'text/plain' } as SharePayload;
}

beforeEach(() => {
  jest.clearAllMocks();
  usePendingShareStore.getState().clearPendingShare();
});

// --- Tests ----------------------------------------------------------------

describe('takeIncomingShare', () => {
  it('fills the pending share with the text, the URL and the images', async () => {
    mockSharedPayloads = [
      textPayload('Look at this'),
      textPayload('https://example.com', 'url'),
      imagePayload('a.jpg'),
    ];

    await takeIncomingShare();

    expect(mockClearSharedPayloads).toHaveBeenCalled();
    expect(usePendingShareStore.getState().pendingShare).toEqual({
      text: 'Look at this\nhttps://example.com',
      images: [
        { uri: expect.stringMatching(/\.jpg$/), width: 200, height: 100 },
      ],
    });
  });

  it('keeps the first images up to the cap, with a toast', async () => {
    mockSharedPayloads = Array.from({ length: MAX_ATTACHMENTS + 2 }, (_, i) =>
      imagePayload(`${i}.jpg`),
    );

    await takeIncomingShare();

    expect(usePendingShareStore.getState().pendingShare?.images).toHaveLength(
      MAX_ATTACHMENTS,
    );
    expect(toast.info).toHaveBeenCalledWith(
      `Only the first ${MAX_ATTACHMENTS} images were added`,
    );
  });

  it('drops images that fail to decode, with a toast, and keeps the rest', async () => {
    mockLoadAsync.mockRejectedValueOnce(new Error('decode failed'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockSharedPayloads = [
      textPayload('caption'),
      imagePayload('broken.jpg'),
      imagePayload('fine.jpg'),
    ];

    await takeIncomingShare();

    expect(usePendingShareStore.getState().pendingShare).toEqual({
      text: 'caption',
      images: [expect.objectContaining({ width: 200 })],
    });
    expect(toast.error).toHaveBeenCalledWith("Couldn't add a shared image");
  });

  it('does nothing when there is no share', async () => {
    mockSharedPayloads = [];

    await takeIncomingShare();

    expect(mockClearSharedPayloads).not.toHaveBeenCalled();
    expect(usePendingShareStore.getState().pendingShare).toBeNull();
  });
});

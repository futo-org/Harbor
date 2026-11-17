import { beforeEach, describe, expect, it } from 'vitest';
import { OpfsFileStoreDriver } from './file-store-driver';

const DIRECTORY = 'file-store-driver-test';

describe('OpfsFileStoreDriver', () => {
  // Wipe any existing data first
  beforeEach(async () => {
    const root = await navigator.storage.getDirectory();
    try {
      await root.removeEntry(DIRECTORY, { recursive: true });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'NotFoundError')) {
        throw err;
      }
    }
  });

  describe('create', () => {
    it('creates its directory in the OPFS root', async () => {
      await OpfsFileStoreDriver.create(DIRECTORY);

      const root = await navigator.storage.getDirectory();
      await expect(root.getDirectoryHandle(DIRECTORY)).resolves.toBeDefined();
    });
  });
});

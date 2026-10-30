import { useComposerStore, type ComposerAttachment } from './useComposerStore';

// The store is a plain zustand store, so we can drive it via getState()/
// setState() without rendering any React.
const store = useComposerStore;
const get = () => store.getState();

const attachment = (
  id: string,
  overrides: Partial<ComposerAttachment> = {},
): ComposerAttachment => ({
  id,
  uri: `file://${id}.jpg`,
  width: 100,
  height: 80,
  status: 'processing',
  ...overrides,
});

beforeEach(() => {
  get().reset();
});

describe('useComposerStore', () => {
  it('starts from a clean initial state', () => {
    expect(get().text).toBe('');
    expect(get().attachments).toEqual([]);
    expect(get().submitting).toBe(false);
    expect(get().error).toBeNull();
  });

  describe('setText', () => {
    it('updates the text', () => {
      get().setText('hello world');
      expect(get().text).toBe('hello world');
    });

    it('keeps mention ranges in sync and returns the text to show', () => {
      get().setText('hi @Ann x');
      get().addMentionRange({ start: 3, end: 7, identity: 'a'.repeat(64) });

      expect(get().setText('oh hi @Ann x')).toEqual({
        text: 'oh hi @Ann x',
        caret: 3,
      });
      expect(get().mentionRanges).toEqual([
        { start: 6, end: 10, identity: 'a'.repeat(64) },
      ]);

      // A backspace inside the mention deletes all of it.
      expect(get().setText('oh hi @An x')).toEqual({
        text: 'oh hi  x',
        caret: 6,
      });
      expect(get().text).toBe('oh hi  x');
      expect(get().mentionRanges).toEqual([]);
    });
  });

  describe('addAttachments', () => {
    it('appends in order across multiple calls', () => {
      get().addAttachments([attachment('a'), attachment('b')]);
      get().addAttachments([attachment('c')]);
      expect(get().attachments.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    });

    it('keeps existing attachments untouched', () => {
      const a = attachment('a');
      get().addAttachments([a]);
      get().addAttachments([attachment('b')]);
      expect(get().attachments[0]).toBe(a);
    });
  });

  describe('setAttachmentStatus', () => {
    it('updates only the targeted attachment', () => {
      get().addAttachments([attachment('a'), attachment('b')]);
      get().setAttachmentStatus('a', 'ready');

      const byId = Object.fromEntries(get().attachments.map((a) => [a.id, a]));
      expect(byId.a.status).toBe('ready');
      expect(byId.b.status).toBe('processing');
    });

    it('can transition to the error state', () => {
      get().addAttachments([attachment('a')]);
      get().setAttachmentStatus('a', 'error');
      expect(get().attachments[0].status).toBe('error');
    });

    it('is a no-op for an unknown id', () => {
      get().addAttachments([attachment('a')]);
      const before = get().attachments;
      get().setAttachmentStatus('missing', 'ready');
      expect(get().attachments).toEqual(before);
    });

    it('preserves the other attachment fields', () => {
      get().addAttachments([attachment('a', { width: 640, height: 480 })]);
      get().setAttachmentStatus('a', 'ready');
      expect(get().attachments[0]).toMatchObject({
        id: 'a',
        uri: 'file://a.jpg',
        width: 640,
        height: 480,
        status: 'ready',
      });
    });
  });

  describe('removeAttachment', () => {
    it('removes the matching attachment and leaves the rest', () => {
      get().addAttachments([attachment('a'), attachment('b'), attachment('c')]);
      get().removeAttachment('b');
      expect(get().attachments.map((a) => a.id)).toEqual(['a', 'c']);
    });

    it('is a no-op for an unknown id', () => {
      get().addAttachments([attachment('a')]);
      get().removeAttachment('missing');
      expect(get().attachments.map((a) => a.id)).toEqual(['a']);
    });
  });

  describe('setSubmitting / setError', () => {
    it('toggles submitting', () => {
      get().setSubmitting(true);
      expect(get().submitting).toBe(true);
      get().setSubmitting(false);
      expect(get().submitting).toBe(false);
    });

    it('sets and clears the error', () => {
      get().setError('boom');
      expect(get().error).toBe('boom');
      get().setError(null);
      expect(get().error).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears text, mention ranges, attachments, submitting, and error', () => {
      get().setText('@Ann');
      get().addMentionRange({ start: 0, end: 4, identity: 'a'.repeat(64) });
      get().addAttachments([attachment('a')]);
      get().setSubmitting(true);
      get().setError('boom');

      get().reset();

      expect(get()).toMatchObject({
        text: '',
        mentionRanges: [],
        attachments: [],
        submitting: false,
        error: null,
      });
    });
  });
});

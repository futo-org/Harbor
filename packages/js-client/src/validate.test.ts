import { beforeAll, describe, expect, it } from 'vitest';
import {
  ContentBodyValidationError,
  ContentValidationError,
  EventValidationError,
  PostValidationError,
  StringError,
  uniffiInitAsync,
  validateContent,
  validateEvent,
} from '@polycentric/rs-core-wasm';
import * as Proto from './proto/v2';

// Runs against the real rs-core wasm (`pnpm --filter
// @polycentric/rs-core-wasm build`), not the mocked generated module.

const postContent = (post: Partial<Proto.Post>): ArrayBuffer =>
  Proto.Content.toBinary({
    contentBody: { oneofKind: 'post', post: Proto.Post.create(post) },
  }).slice().buffer;

const postError = (error: PostValidationError) =>
  new ContentValidationError.ContentBody(
    new ContentBodyValidationError.Post(error),
  );

describe('rs-core validation', () => {
  beforeAll(() => uniffiInitAsync());

  it('returns no errors for valid content', () => {
    expect(validateContent(postContent({ text: 'hi' }))).toEqual([]);
  });

  it('returns every error in the content', () => {
    const errors = validateContent(
      postContent({ text: 'x'.repeat(2001), labels: ['x'.repeat(201)] }),
    );

    expect(errors).toEqual([
      postError(
        new PostValidationError.Text(
          new StringError.TooLong({ length: 2001, max: 2000 }),
        ),
      ),
      postError(
        new PostValidationError.LabelsItem({
          index: 0,
          error: new StringError.TooLong({ length: 201, max: 200 }),
        }),
      ),
    ]);
  });

  it('reports missing event fields', () => {
    const errors = validateEvent(
      Proto.Event.toBinary(Proto.Event.create()).slice().buffer,
    );

    expect(errors).toEqual([
      new EventValidationError.KeyMissing(),
      new EventValidationError.VectorClockMissing(),
      new EventValidationError.ContentDigestMissing(),
    ]);
  });

  it('throws on bytes that are not a protobuf message', () => {
    expect(() => validateContent(new Uint8Array([0xff]).buffer)).toThrow(
      /Invalid content bytes/,
    );
  });
});

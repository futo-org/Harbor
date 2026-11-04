/**
 * Errors from rs-core, as JavaScript classes. rs-core reports an `SdkError`
 * with a variant tag; in-process bindings throw it as a generated class and
 * the web worker relays the tag. Either way it becomes one of these.
 */

/** Any error rs-core reported. `tag` is its `SdkError` variant. */
export class PolycentricError extends Error {
  constructor(
    message: string,
    readonly tag?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Local storage failed (database, blobs, or the key cipher). */
export class StorageError extends PolycentricError {}
/** Something that must be unique already exists (e.g. an event's sequence). */
export class AlreadyExistsError extends PolycentricError {}
export class NotFoundError extends PolycentricError {}
/** Nobody is signed in. */
export class NoActiveIdentityError extends PolycentricError {}
/** The key isn't authorized to do this. */
export class UnauthorizedError extends PolycentricError {}
/** The server is already in the identity's list. */
export class ServerAlreadyAddedError extends PolycentricError {}
/** No server could be reached, or one rejected the request. */
export class NetworkError extends PolycentricError {}
export class CryptoError extends PolycentricError {}
/** Arguments were malformed. */
export class InvalidInputError extends PolycentricError {}

const BY_TAG: Record<string, typeof PolycentricError> = {
  Storage: StorageError,
  AlreadyExists: AlreadyExistsError,
  NotFound: NotFoundError,
  NoActiveIdentity: NoActiveIdentityError,
  NoActiveKeyPair: NoActiveIdentityError,
  Unauthorized: UnauthorizedError,
  ServerAlreadyAdded: ServerAlreadyAddedError,
  Network: NetworkError,
  Crypto: CryptoError,
  Decode: InvalidInputError,
  InvalidInput: InvalidInputError,
};

/** The `SdkError` variant of `error`, if it is one. */
export function sdkErrorTag(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const tag = (error as { tag?: unknown }).tag;
  return typeof tag === 'string' ? tag : undefined;
}

/** `error` as a `PolycentricError` when rs-core reported it; else as is. */
export function toPolycentricError(error: unknown): unknown {
  if (error instanceof PolycentricError) return error;
  const tag = sdkErrorTag(error);
  if (!tag) return error;
  const message =
    (error as { message?: unknown }).message?.toString() ?? `rs-core: ${tag}`;
  const Class = BY_TAG[tag] ?? PolycentricError;
  return new Class(message, tag, { cause: error });
}

/** Run `call`, translating rs-core errors. */
export async function wrapError<T>(call: () => Promise<T> | T): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toPolycentricError(error);
  }
}

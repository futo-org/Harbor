package org.futo.polycentric.core

/**
 * Root of the typed error hierarchy (port of js-core `errors.ts`).
 * Precondition failures still surface as
 * [IllegalArgumentException]/[IllegalStateException].
 */
open class PolycentricException(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

/** An operation needs a current device key pair, but none is set. */
class NoActiveKeyPairException : PolycentricException("No active key pair")

/** An operation needs a signed-in identity, but the client is logged out. */
class NoActiveIdentityException : PolycentricException("No active identity")

/** [IdentityManager.addServer] was given a server already on the identity. */
class ServerAlreadyAddedException : PolycentricException("Server already added")

/** No valid identity chain for the given identity key could be resolved. */
class IdentityNotFoundException(
    identityKey: String,
) : PolycentricException("Identity $identityKey not found")

/** The current key pair is not a rotation or signing key of the identity. */
class UnauthorizedKeyException : PolycentricException("Current key is not authorized for this identity")

// ── rs-core (UniFFI) failures ──────────────────────────────────────────

/**
 * Wraps UniFFI-generated `org.futo.polycentric.ffi.CoreException`.
 * This lets consumers only catch [PolycentricException].
 */
class CoreFailureException(
    message: String,
    cause: Throwable? = null,
) : PolycentricException(message, cause)

/** A key passed to an [ICryptoManager] has the wrong length for its key type. */
class InvalidKeyLengthException(
    message: String,
    cause: Throwable? = null,
) : PolycentricException(message, cause)

/** A signature passed to an [ICryptoManager] is malformed (e.g. wrong length). */
class InvalidSignatureException(
    message: String,
    cause: Throwable? = null,
) : PolycentricException(message, cause)

/** Thrown by encrypted key-store drivers when encryption fails. */
class EncryptionException(
    message: String,
    cause: Throwable? = null,
) : PolycentricException(message, cause)

/** Thrown by encrypted key-store drivers when decryption fails. */
class DecryptionException(
    message: String,
    cause: Throwable? = null,
) : PolycentricException(message, cause)

/** The client or a driver was configured incorrectly. js-core parity; not thrown by this package yet. */
class ConfigurationException(
    message: String,
    cause: Throwable? = null,
) : PolycentricException(message, cause)

/** Thrown by storage-driver implementations on database failures. */
class DatabaseException(
    message: String,
    cause: Throwable? = null,
) : PolycentricException(message, cause)

/** A query against the servers failed. js-core parity; not thrown by this package yet. */
class QueryException(
    message: String,
    cause: Throwable? = null,
) : PolycentricException(message, cause)

/** An HTTP request failed. js-core parity; not thrown by this package yet. */
class HttpException(
    message: String,
    cause: Throwable? = null,
) : PolycentricException(message, cause)

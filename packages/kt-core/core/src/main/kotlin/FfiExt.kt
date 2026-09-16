package org.futo.polycentric.core

import kotlinx.coroutines.CancellationException
import org.futo.polycentric.ffi.CoreException

/**
 * Run an rs-core (UniFFI) operation, folding its generated [CoreException]
 * into [CoreFailureException] so consumers of this package only catch
 * [PolycentricException]. All other throwables remain untouched.
 *
 * Only wrap calls that can actually fail (the `@Throws(CoreException::class)`
 * methods of the generated bindings): pure in-memory setters like
 * `setServers`/`clearAuthTokens` never raise it.
 */
internal inline fun <R> coreCall(block: () -> R): R =
    try {
        block()
    } catch (e: CoreException) {
        throw CoreFailureException(e.message ?: "Rust core operation failed", e)
    }

/**
 * [kotlin.result.runCatching] variant that never absorbs
 * [CancellationException]s, such that suspend events keep working for
 * concurrency. Every other failure is captured as [Result.failure] exactly
 * like `runCatching`. Prefer this over `runCatching` around any block
 * containing suspension points.
 */
internal inline fun <R> runCatchingExceptCancellation(block: () -> R): Result<R> =
    try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        Result.failure(e)
    }

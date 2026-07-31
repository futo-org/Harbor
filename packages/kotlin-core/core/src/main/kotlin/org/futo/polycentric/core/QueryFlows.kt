package org.futo.polycentric.core

import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import org.futo.polycentric.ffi.PolycentricCore
import org.futo.polycentric.ffi.Query
import org.futo.polycentric.ffi.QueryObserver
import org.futo.polycentric.ffi.QueryOpts
import org.futo.polycentric.ffi.QueryResultFfi
import org.futo.polycentric.ffi.QueryStatus

class CoreQueryException(message: String) : Exception(message)

/**
 * Bridge the core's `QueryObservable` (fan-out over every configured
 * server) into a cold Kotlin [Flow].
 *
 * Each emission is the merged result so far plus the fan-out status.
 * NOTE: the underlying observable NEVER calls `complete()` — it stays
 * subscribed for cache invalidations. Collectors that want a one-shot
 * answer must stop at the first `Success` emission ([awaitQuery]), which
 * is exactly the contract js-core's `listEvents` relies on.
 */
fun PolycentricCore.queryFlow(
    query: Query,
    queryKey: List<String>? = null,
    opts: QueryOpts? = null,
): Flow<QueryResultFfi> = callbackFlow {
    val observable = fetchQuery(queryKey, query, opts)
    val subscription = observable.subscribe(object : QueryObserver {
        override fun next(result: QueryResultFfi) {
            trySend(result)
        }

        override fun error(message: String) {
            close(CoreQueryException(message))
        }

        override fun complete() {
            close()
        }
    })
    awaitClose { subscription.unsubscribe() }
}

/**
 * One-shot query: resolve on the Loading→Success transition once every
 * server slot has reported, returning the final merged payload bytes
 * (a serialized response proto — the caller decodes with the matching
 * Wire ADAPTER). Mirrors js-core `PolycentricClient.listEvents`.
 */
suspend fun PolycentricCore.awaitQuery(
    query: Query,
    queryKey: List<String>? = null,
    opts: QueryOpts? = null,
): ByteArray? {
    var latest: ByteArray? = null
    queryFlow(query, queryKey, opts).first { result ->
        result.data?.let { latest = it }
        result.status == QueryStatus.SUCCESS
    }
    return latest
}

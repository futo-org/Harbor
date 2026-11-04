package org.futo.polycentric.core

import android.content.Context
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.buffer
import kotlinx.coroutines.flow.callbackFlow
import org.futo.polycentric.ffi.Application
import org.futo.polycentric.ffi.BackupCheck
import org.futo.polycentric.ffi.Blob
import org.futo.polycentric.ffi.ClientEvent
import org.futo.polycentric.ffi.ClientListener
import org.futo.polycentric.ffi.ClientSnapshot
import org.futo.polycentric.ffi.Content
import org.futo.polycentric.ffi.ContentDigest
import org.futo.polycentric.ffi.EventBundle
import org.futo.polycentric.ffi.EventKey
import org.futo.polycentric.ffi.GetServerInfoResponse
import org.futo.polycentric.ffi.HarborClient
import org.futo.polycentric.ffi.HarborClientBuilder
import org.futo.polycentric.ffi.HarborClientConfig
import org.futo.polycentric.ffi.IdentityState
import org.futo.polycentric.ffi.KeyCipher
import org.futo.polycentric.ffi.LegacyEvent
import org.futo.polycentric.ffi.LegacyLogin
import org.futo.polycentric.ffi.ListEventsArgs
import org.futo.polycentric.ffi.LoginId
import org.futo.polycentric.ffi.LoginKind
import org.futo.polycentric.ffi.LoginOverview
import org.futo.polycentric.ffi.LoginStatus
import org.futo.polycentric.ffi.PairingInfo
import org.futo.polycentric.ffi.PairingSession
import org.futo.polycentric.ffi.PendingEvent
import org.futo.polycentric.ffi.PublicKey
import org.futo.polycentric.ffi.PublishArgs
import org.futo.polycentric.ffi.Query
import org.futo.polycentric.ffi.QueryData
import org.futo.polycentric.ffi.QueryObserver
import org.futo.polycentric.ffi.QueryOpts
import org.futo.polycentric.ffi.QueryResult
import org.futo.polycentric.ffi.RegisterPushNotificationRequest
import org.futo.polycentric.ffi.ReportStatus
import org.futo.polycentric.ffi.StorageConfig
import org.futo.polycentric.ffi.SyncStrategy
import org.futo.polycentric.ffi.UrlInfoResponse
import java.io.File

/**
 * The Polycentric client for Kotlin: suspend functions and flows over
 * rs-core's [HarborClient], which does the work — storage, keys, signing,
 * sync, identities, pairing and queries.
 *
 * Protocol types are the UniFFI-generated records in
 * `org.futo.polycentric.ffi` (e.g. [Content], [EventBundle], [EventKey]),
 * passed through unchanged. Failures surface as the generated
 * `SdkException`. Anything not wrapped here is on [ffi], and rs-core's
 * free functions (`eventKeyId`, `encodePairingCode`, `blobUrls`,
 * `backupInfo`, `aeadKeyCipher`, ...) are called directly.
 */
class PolycentricClient private constructor(
    /** The underlying rs-core client. */
    val ffi: HarborClient,
) : AutoCloseable {
    companion object {
        /**
         * Open a client in an Android app's private storage: a SQLite
         * database named [databaseName] and blobs in [blobDirectory].
         * Private keys are sealed at rest with [keyCipher], an Android
         * Keystore key by default.
         */
        suspend fun create(
            context: Context,
            databaseName: String = "polycentric-v2.db",
            blobDirectory: File = File(context.filesDir, "polycentric-blobs"),
            seedServers: List<String> = emptyList(),
            application: Application? = null,
            keyCipher: KeyCipher = AndroidKeystoreKeyCipher(),
        ): PolycentricClient =
            open(
                databasePath = context.getDatabasePath(databaseName).absolutePath,
                keyCipher = keyCipher,
                blobDirectory = blobDirectory.absolutePath,
                seedServers = seedServers,
                application = application,
            )

        /**
         * Open a client on a SQLite file at [databasePath], keeping blobs in
         * [blobDirectory] (or in the database when null). Private keys are
         * sealed at rest with [keyCipher]; hosts holding a 32-byte wrapping
         * key can use `aeadKeyCipher(wrappingKey)`.
         */
        suspend fun open(
            databasePath: String,
            keyCipher: KeyCipher,
            blobDirectory: String? = null,
            seedServers: List<String> = emptyList(),
            application: Application? = null,
        ): PolycentricClient =
            open(
                HarborClientConfig(StorageConfig.Sqlite(databasePath, blobDirectory), seedServers, application),
                keyCipher,
            )

        /** A client that keeps nothing past its lifetime. */
        suspend fun inMemory(
            seedServers: List<String> = emptyList(),
            application: Application? = null,
            keyCipher: KeyCipher? = null,
        ): PolycentricClient = open(HarborClientConfig(StorageConfig.Memory, seedServers, application), keyCipher)

        /**
         * Open a client from a full [config]. [keyCipher] is required
         * unless the storage is [StorageConfig.Memory].
         */
        suspend fun open(
            config: HarborClientConfig,
            keyCipher: KeyCipher?,
        ): PolycentricClient =
            HarborClientBuilder(config).use { builder ->
                keyCipher?.let(builder::keyCipher)
                PolycentricClient(builder.open())
            }
    }

    private val snapshotState = MutableStateFlow(ffi.snapshot())
    private val snapshotListener =
        ffi.addListener(
            object : ClientListener {
                override fun onEvent(event: ClientEvent) {
                    if (event is ClientEvent.Snapshot) snapshotState.value = event.snapshot
                }
            },
        )

    init {
        // Catch a change between the first read and the listener.
        snapshotState.value = ffi.snapshot()
    }

    /** What a UI renders: state, login and servers. */
    val snapshot: StateFlow<ClientSnapshot> = snapshotState.asStateFlow()

    /**
     * Everything the client reports, from when collection starts: snapshots,
     * events committed on this device, pulls and push results.
     */
    val events: Flow<ClientEvent> =
        callbackFlow {
            val id =
                ffi.addListener(
                    object : ClientListener {
                        override fun onEvent(event: ClientEvent) {
                            trySend(event)
                        }
                    },
                )
            awaitClose { ffi.removeListener(id) }
        }.buffer(Channel.UNLIMITED)

    /** Events this client stored, its own or committed through [commitEvent]. */
    val committed: Flow<EventBundle> =
        callbackFlow {
            val id =
                ffi.addListener(
                    object : ClientListener {
                        override fun onEvent(event: ClientEvent) {
                            if (event is ClientEvent.Committed) trySend(event.bundle)
                        }
                    },
                )
            awaitClose { ffi.removeListener(id) }
        }.buffer(Channel.UNLIMITED)

    /** The signed-in login, if any. */
    val login: LoginOverview? get() = snapshot.value.login

    /** The servers in use: the signed-in identity's, else the seed servers. */
    val servers: List<String> get() = snapshot.value.servers

    override fun close() {
        ffi.removeListener(snapshotListener)
        ffi.close()
    }

    // ── Events ─────────────────────────────────────────────────────────

    /** Sign and store [content] in [collection] as the signed-in login. */
    suspend fun publish(
        content: Content,
        collection: Int,
    ): EventBundle = ffi.publish(content, collection)

    /**
     * Sign [content] in [collection] without storing it, e.g. to show it
     * optimistically. Store it with [commitEvent].
     */
    suspend fun prepareEvent(
        content: Content,
        collection: Int,
    ): PendingEvent = ffi.prepareEvent(content, collection)

    /**
     * Store a [prepareEvent] result. Throws `SdkException.AlreadyExists` if
     * its sequence was taken since; prepare it again then.
     */
    suspend fun commitEvent(event: PendingEvent): EventBundle = ffi.commitEvent(event)

    /** Non-deleted events of one stream, from what's held locally. */
    fun listValidEvents(
        identity: String,
        collection: Int,
    ): List<EventBundle> = ffi.listValidEvents(identity, collection)

    /** The latest known state of [identity] (default: the signed-in one). */
    fun resolveIdentity(identity: String? = null): IdentityState? = ffi.resolveIdentity(identity)

    /** The identity chain of [identity], oldest first. */
    fun resolveIdentityChain(identity: String): List<EventBundle> = ffi.resolveIdentityChain(identity)

    /** Identities the signed-in identity blocks. */
    fun blockedIdentities(): List<String> = ffi.blockedIdentities()

    // ── Queries ────────────────────────────────────────────────────────

    /**
     * Run [query] across the servers and emit each result as it updates.
     * [queryKey] is the cache key shared with other subscribers (null
     * bypasses the cache). Completes when the query does; fails with
     * [QueryException] if it errors.
     */
    fun query(
        query: Query,
        queryKey: List<String>? = null,
        opts: QueryOpts? = null,
    ): Flow<QueryResult> =
        callbackFlow {
            val observable = ffi.fetchQuery(queryKey, query, opts)
            val subscription =
                observable.subscribe(
                    object : QueryObserver {
                        override fun next(result: QueryResult) {
                            trySend(result)
                        }

                        override fun error(message: String) {
                            close(QueryException(message))
                        }

                        override fun complete() {
                            close()
                        }
                    },
                )
            awaitClose {
                subscription.unsubscribe()
                subscription.close()
                observable.close()
            }
        }.buffer(Channel.UNLIMITED)

    /** The first successful result of [query], or null if there was none. */
    suspend fun awaitQuery(
        query: Query,
        queryKey: List<String>? = null,
        opts: QueryOpts? = null,
    ): QueryData? = ffi.awaitQuery(query, queryKey, opts)

    /** One-shot ListEvents; results also land in the local engine. */
    suspend fun listEvents(
        args: ListEventsArgs,
        queryKey: List<String>? = null,
        opts: QueryOpts? = null,
    ): List<EventBundle> = ffi.listEvents(args, queryKey, opts)

    /** One-shot ListEvents for one identity's events. */
    suspend fun listEvents(
        identity: String,
        collection: Int? = null,
        limit: Int? = null,
        signedBy: PublicKey? = null,
        sequenceGt: Long? = null,
        sequenceLt: Long? = null,
        heads: List<EventKey>? = null,
        opts: QueryOpts? = null,
    ): List<EventBundle> =
        listEvents(
            ListEventsArgs(limit, identity, collection, signedBy, sequenceGt, sequenceLt, heads),
            opts = opts,
        )

    /** Clear the cache for [queryKey] and every key under it. */
    fun invalidateQuery(queryKey: List<String>) = ffi.invalidateQuery(queryKey)

    fun invalidateAllQueries() = ffi.invalidateAllQueries()

    // ── Sync ───────────────────────────────────────────────────────────

    /** Pull and/or push per [strategy]; returns how many events were pulled. */
    suspend fun sync(strategy: SyncStrategy = SyncStrategy.PARTIAL): Int = ffi.sync(strategy).toInt()

    /** Pull the signed-in identity's events as its other devices publish them. */
    fun startLiveSync() = ffi.startLiveSync()

    fun stopLiveSync() = ffi.stopLiveSync()

    /** Use [servers] until the signed-in identity's document names its own. */
    fun setServers(servers: List<String>) = ffi.setServers(servers)

    // ── Blobs ──────────────────────────────────────────────────────────

    /**
     * Store blob bytes and return the [Blob] to reference from content.
     * It's uploaded when the content is pushed.
     */
    suspend fun commitBlob(
        bytes: ByteArray,
        mimeType: String,
    ): Blob = ffi.commitBlob(bytes, mimeType)

    /** The blob's bytes from local storage, or null. */
    suspend fun getBlob(digest: ContentDigest): ByteArray? = ffi.getBlob(digest)

    /** The blob's bytes, locally or from the servers. */
    suspend fun fetchBlob(digest: ContentDigest): ByteArray? = ffi.fetchBlob(digest)

    suspend fun hasBlob(digest: ContentDigest): Boolean = ffi.hasBlob(digest)

    suspend fun deleteBlob(digest: ContentDigest): Boolean = ffi.deleteBlob(digest)

    /** Upload a blob's body to [servers] (default: all). */
    suspend fun uploadBlob(
        blob: Blob,
        body: ByteArray,
        servers: List<String>? = null,
    ) = ffi.uploadBlob(blob, body, servers)

    // ── Logins ─────────────────────────────────────────────────────────

    /** Logins stored on this device, optionally only [identity]'s. */
    suspend fun listLogins(identity: String? = null): List<LoginOverview> = ffi.listLogins(identity)

    /**
     * Sign in as [login], or out with null. With [persist], it's also the
     * login restored next time.
     */
    suspend fun loginAs(
        login: LoginId?,
        persist: Boolean = true,
    ) = ffi.loginAs(login, persist)

    suspend fun changeLoginStatus(
        id: LoginId,
        status: LoginStatus,
    ) = ffi.changeLoginStatus(id, status)

    suspend fun deleteLogin(id: LoginId) = ffi.deleteLogin(id)

    /**
     * Create and publish a new identity and sign in as it, adding [server]
     * to its server list first if given.
     */
    suspend fun createIdentity(server: String? = null): LoginId = ffi.createIdentity(server)

    /**
     * Generate and store a key pair to pair (or recover) into [identity].
     * The key stays in rs-core; share its public key from the result.
     */
    suspend fun beginLogin(
        identity: String,
        kind: LoginKind,
    ): LoginOverview = ffi.beginLogin(identity, kind)

    /**
     * Claim an identity that authorized a pending login's key: verify the
     * chain, store it, publish as the new key and sign in.
     */
    suspend fun claim(
        login: LoginId,
        servers: List<String>? = null,
    ): IdentityState = ffi.claim(login, servers)

    /** A JWT authenticating the signed-in identity to [audience]. */
    fun createServerJwt(audience: String): String = ffi.createServerJwt(audience)

    // ── Backups ────────────────────────────────────────────────────────

    /**
     * Rotate the recovery key and return a backup of the signed-in identity
     * as text. Older backups stop working.
     */
    suspend fun createBackup(): String = ffi.createBackup()

    /** Whether [backup] can restore [identity] (default: the signed-in one). */
    fun checkBackup(
        backup: String,
        identity: String? = null,
    ): BackupCheck = ffi.checkBackup(backup, identity)

    /** Restore the identity [backup] is for and sign in as it. */
    suspend fun recoverFromBackup(backup: String): LoginId = ffi.recoverFromBackup(backup)

    // ── Identity ───────────────────────────────────────────────────────

    /**
     * Publish a new document for the signed-in identity; the signed-in key
     * must be a rotation key.
     */
    suspend fun publishIdentityUpdate(args: PublishArgs): EventKey = ffi.publishIdentityUpdate(args)

    suspend fun addSigningKey(key: PublicKey): EventKey = ffi.addSigningKey(key)

    suspend fun removeSigningKey(key: PublicKey): EventKey = ffi.removeSigningKey(key)

    suspend fun addRotationKey(key: PublicKey): EventKey = ffi.addRotationKey(key)

    suspend fun removeRotationKey(key: PublicKey): EventKey = ffi.removeRotationKey(key)

    suspend fun addServer(url: String): EventKey = ffi.addServer(url)

    suspend fun removeServer(url: String): EventKey = ffi.removeServer(url)

    // ── Pairing ────────────────────────────────────────────────────────

    /** Issuer: start a session for the signed-in identity on [server]. */
    suspend fun createPairingSession(server: String): PairingSession = ffi.createPairingSession(server)

    /** Issuer: publish a new state (e.g. after authorizing a claimer). */
    suspend fun updatePairingSession(
        info: PairingInfo,
        sequence: Long,
    ): PairingSession = ffi.updatePairingSession(info, sequence)

    suspend fun getPairingSession(info: PairingInfo): PairingSession = ffi.getPairingSession(info)

    /** Issuer: the keys asking to be paired. */
    suspend fun pollForClaimers(info: PairingInfo): List<PublicKey> = ffi.pollForClaimers(info)

    /** Claimer: ask to be paired with a pending [login]'s key. */
    suspend fun joinPairingSession(
        info: PairingInfo,
        login: LoginId,
    ) = ffi.joinPairingSession(info, login)

    /** Claimer: whether the issuer authorized [login]'s key; then [claim]. */
    suspend fun pollForAuthorization(
        info: PairingInfo,
        login: LoginId,
    ): Boolean = ffi.pollForAuthorization(info, login)

    // ── Servers ────────────────────────────────────────────────────────

    /** Link preview for [url] from the first server that answers. */
    suspend fun urlInfo(url: String): UrlInfoResponse? = ffi.urlInfo(url)

    suspend fun serverInfo(server: String): GetServerInfoResponse = ffi.serverInfo(server)

    /** Ban or unban an identity on [server] (moderators only). */
    suspend fun setBanStatus(
        server: String,
        targetIdentity: String,
        banned: Boolean,
    ) = ffi.setBanStatus(server, targetIdentity, banned)

    suspend fun resolveReport(
        server: String,
        reportId: Long,
        status: ReportStatus,
    ) = ffi.resolveReport(server, reportId, status)

    /** Remove an event's content from [server] (moderators only). */
    suspend fun deleteContent(
        server: String,
        target: EventKey,
    ) = ffi.deleteContent(server, target)

    /** Mark notifications up to [lastSeen] as read on every server. */
    suspend fun acknowledgeNotifications(lastSeen: EventKey) = ffi.acknowledgeNotifications(lastSeen)

    suspend fun registerPushNotifications(
        servers: List<String>,
        request: RegisterPushNotificationRequest,
    ) = ffi.registerPushNotifications(servers, request)

    // ── Migration ──────────────────────────────────────────────────────

    /**
     * Bring data from an older store into this client's storage: signed
     * events and serialized content exactly as stored, and logins. Signs in
     * as [active] if nobody is signed in.
     */
    suspend fun importLegacyData(
        events: List<LegacyEvent>,
        contents: List<ByteArray>,
        logins: List<LegacyLogin>,
        active: LoginId? = null,
    ) = ffi.importLegacyData(events, contents, logins, active)
}

/** A query failed; [message] is rs-core's description. */
class QueryException(
    message: String,
) : Exception(message)

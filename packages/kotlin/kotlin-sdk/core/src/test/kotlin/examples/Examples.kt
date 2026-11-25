// Shown on docs/content/developer/examples.md and
// declaring-your-application.md, which pull in the regions
// below. This lives in the test source set so CI compiles it with the SDK; it
// sits in its own package so its imports are the ones an app needs.

// We include region-definition comments in our imports, so we need to disable this check
@file:Suppress("ktlint:standard:import-ordering")

package org.futo.polycentric.examples

// #region client
import android.content.Context
import org.futo.polycentric.sdk.AndroidFileStoreDriver
import org.futo.polycentric.sdk.PolycentricClient
import org.futo.polycentric.sdk.SqliteStorageDriver
import org.futo.polycentric.ffi.PolycentricCore
import java.io.File
// #endregion client
// #region publish
import org.futo.polycentric.sdk.Collections
import polycentric.v2.Content
import polycentric.v2.Post
import polycentric.v2.ProfileUpdate
// #endregion publish
// #region read-profile
import org.futo.polycentric.sdk.getProfile
// #endregion read-profile
// #region read-feed
import org.futo.polycentric.sdk.getIdentityFeed
// #endregion read-feed
// #region read-event
import org.futo.polycentric.sdk.getEvent
// #endregion read-event
// #region application
import polycentric.v2.Application
// #endregion application
import polycentric.v2.EventBundle
import polycentric.v2.EventKey

suspend fun createClient(context: Context): PolycentricClient {
    // #region client
    val client =
        PolycentricClient.create(
            core = PolycentricCore(),
            storageDriver = SqliteStorageDriver(context),
            filestore = AndroidFileStoreDriver(File(context.filesDir, "blobs")),
            seedServers = listOf("http://localhost:3000"),
        )
    // #endregion client
    return client
}

suspend fun createClientWithApplication(context: Context): PolycentricClient {
    // #region application
    val client =
        PolycentricClient(
            core = PolycentricCore(),
            storageDriver = SqliteStorageDriver(context),
            filestore = AndroidFileStoreDriver(File(context.filesDir, "blobs")),
            application =
                Application(
                    name = "My App",
                    id = "com.example.myapp",
                    version = "1.2.0",
                    url = "https://myapp.example.com",
                ),
        )
    client.initialize()
    // #endregion application
    return client
}

suspend fun ensureIdentity(client: PolycentricClient) {
    // #region identity
    if (client.activeIdentityKey == null) {
        client.identityManager.publish(
            identityKey = null,
            rotationKeys = listOf(client.currentSystem),
            signingKeys = emptyList(),
            servers = listOf("http://localhost:3000"),
        )
    }
    // #endregion identity
}

// #region publish
suspend fun PolycentricClient.publish(
    content: Content,
    collection: Int,
) {
    val signed = signEvent(buildEvent(content, collection))
    commitEvent(signed, content)
    sync()
}
// #endregion publish

suspend fun publishContent(client: PolycentricClient) {
    // #region publish
    client.publish(Content(post = Post(text = "Hello, Polycentric!")), Collections.FEED)
    client.publish(
        Content(profile_update = ProfileUpdate(name = "Ada")),
        Collections.PROFILE,
    )
    // #endregion publish
}

suspend fun readProfile(
    client: PolycentricClient,
    identityKey: String,
) {
    // #region read-profile
    val profile = client.getProfile(identityKey)
    if (profile != null) {
        println("${profile.followers_count} followers")
        profile.event_bundles.forEach { bundle ->
            val bytes = bundle.serialized_content?.content_bytes ?: return@forEach
            val content = Content.ADAPTER.decode(bytes)
            content.profile_update?.let { println(it.name) }
        }
    }
    // #endregion read-profile
}

suspend fun readIdentityFeed(
    client: PolycentricClient,
    identityKey: String,
) {
    // #region read-feed
    val feed = client.getIdentityFeed(identityKey, limit = 20)
    feed?.event_bundles?.forEach { bundle ->
        val bytes = bundle.serialized_content?.content_bytes ?: return@forEach
        val content = Content.ADAPTER.decode(bytes)
        content.post?.let { println(it.text) }
    }
    // #endregion read-feed
}

suspend fun readEvent(
    client: PolycentricClient,
    postKey: EventKey,
): EventBundle? {
    // #region read-event
    val bundle =
        client.getEvent(
            identity = postKey.identity,
            collection = postKey.collection,
            sequence = postKey.sequence,
        )
    // #endregion read-event
    return bundle
}

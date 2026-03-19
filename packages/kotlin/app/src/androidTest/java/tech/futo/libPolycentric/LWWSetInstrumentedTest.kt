package tech.futo.libPolycentric

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.HTTPNetworkManager
import tech.futo.libPolycentric.drivers.storage.sqlite.SQLiteStorageDriver
import tech.futo.libPolycentric.services.IdentityOptions

@RunWith(AndroidJUnit4::class)
class LWWSetInstrumentedTest {

    private lateinit var client: PolycentricClient

    @Before
    fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        client = PolycentricClient(
            Ed25519CryptoManager(),
            SQLiteStorageDriver(context, "test-lwwset.db"),
            HTTPNetworkManager()
        )
        runBlocking { client.init() }
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
    }

    @After
    fun tearDown() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.deleteDatabase("test-lwwset.db")
    }

    // Follow Set

    @Test
    fun shouldAddAndRemoveFollowsCorrectly() = runBlocking {
        val system1 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )
        val system2 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )
        val system3 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )

        var follows = client.queryManager.queryFollows(client.currentIdentity.keyPair.publicKey)
        assertTrue(follows.isEmpty())

        client.contentManager.createFollow(system1.publicKey)
        client.contentManager.createFollow(system2.publicKey)
        client.contentManager.createFollow(system3.publicKey)

        follows = client.queryManager.queryFollows(client.currentIdentity.keyPair.publicKey)
        assertEquals(3, follows.size)
        assertTrue(follows.map { it.key }.containsAll(listOf(system1.publicKey.key, system2.publicKey.key, system3.publicKey.key)))

        client.contentManager.createUnfollow(system2.publicKey)

        follows = client.queryManager.queryFollows(client.currentIdentity.keyPair.publicKey)
        assertEquals(2, follows.size)
        assertTrue(follows.map { it.key }.containsAll(listOf(system1.publicKey.key, system3.publicKey.key)))
        assertFalse(follows.map { it.key }.contains(system2.publicKey.key))
    }

    // Block Set

    @Test
    fun shouldAddAndRemoveBlocksCorrectly() = runBlocking {
        val system1 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )
        val system2 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )

        var blocks = client.queryManager.queryBlocks(client.currentIdentity.keyPair.publicKey)
        assertTrue(blocks.isEmpty())

        client.contentManager.createBlock(system1.publicKey)
        client.contentManager.createBlock(system2.publicKey)

        blocks = client.queryManager.queryBlocks(client.currentIdentity.keyPair.publicKey)
        assertEquals(2, blocks.size)
        assertTrue(blocks.map { it.key }.containsAll(listOf(system1.publicKey.key, system2.publicKey.key)))

        client.contentManager.createUnblock(system1.publicKey)

        blocks = client.queryManager.queryBlocks(client.currentIdentity.keyPair.publicKey)
        assertEquals(1, blocks.size)
        assertEquals(system2.publicKey.key, blocks[0].key)
        assertFalse(blocks.map { it.key }.contains(system1.publicKey.key))
    }

    // Server Set

    @Test
    fun shouldAddAndRemoveServersCorrectly() = runBlocking {
        var servers = client.queryManager.queryServers(client.currentIdentity.keyPair.publicKey)
        assertTrue(servers.isEmpty())

        client.contentManager.createAddServer("https://server1.example.com")
        client.contentManager.createAddServer("https://server2.example.com")
        client.contentManager.createAddServer("https://server3.example.com")

        servers = client.queryManager.queryServers(client.currentIdentity.keyPair.publicKey)
        assertEquals(3, servers.size)
        assertTrue(servers.containsAll(listOf("https://server1.example.com", "https://server2.example.com", "https://server3.example.com")))

        client.contentManager.createRemoveServer("https://server2.example.com")

        servers = client.queryManager.queryServers(client.currentIdentity.keyPair.publicKey)
        assertEquals(2, servers.size)
        assertTrue(servers.containsAll(listOf("https://server1.example.com", "https://server3.example.com")))
        assertFalse(servers.contains("https://server2.example.com"))
    }

    // Authority Set

    @Test
    fun shouldAddAndRemoveAuthoritiesCorrectly() = runBlocking {
        var authorities = client.queryManager.queryAuthorities(client.currentIdentity.keyPair.publicKey)
        assertTrue(authorities.isEmpty())

        client.contentManager.createAddAuthority("https://auth1.example.com")
        client.contentManager.createAddAuthority("https://auth2.example.com")

        authorities = client.queryManager.queryAuthorities(client.currentIdentity.keyPair.publicKey)
        assertEquals(2, authorities.size)
        assertTrue(authorities.containsAll(listOf("https://auth1.example.com", "https://auth2.example.com")))

        client.contentManager.createRemoveAuthority("https://auth1.example.com")

        authorities = client.queryManager.queryAuthorities(client.currentIdentity.keyPair.publicKey)
        assertEquals(1, authorities.size)
        assertEquals("https://auth2.example.com", authorities[0])
        assertFalse(authorities.contains("https://auth1.example.com"))
    }

    // Topic Set

    @Test
    fun shouldAddAndRemoveTopicsCorrectly() = runBlocking {
        var topics = client.queryManager.queryTopics(client.currentIdentity.keyPair.publicKey)
        assertTrue(topics.isEmpty())

        client.contentManager.createJoinTopic("technology")
        client.contentManager.createJoinTopic("science")
        client.contentManager.createJoinTopic("politics")

        topics = client.queryManager.queryTopics(client.currentIdentity.keyPair.publicKey)
        assertEquals(3, topics.size)
        assertTrue(topics.containsAll(listOf("technology", "science", "politics")))

        client.contentManager.createLeaveTopic("science")

        topics = client.queryManager.queryTopics(client.currentIdentity.keyPair.publicKey)
        assertEquals(2, topics.size)
        assertTrue(topics.containsAll(listOf("technology", "politics")))
        assertFalse(topics.contains("science"))
    }

    // Cross-System Isolation

    @Test
    fun shouldMaintainSeparateSetsForDifferentSystems() = runBlocking {
        val identity1 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = true)
        )
        val identity2 = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        )

        client.contentManager.createAddServer("https://identity1-server.com")
        client.contentManager.createJoinTopic("identity1-topic")

        assertEquals(listOf("https://identity1-server.com"), client.queryManager.queryServers(identity1.publicKey))
        assertEquals(listOf("identity1-topic"), client.queryManager.queryTopics(identity1.publicKey))

        client.identityManager.switchIdentity(identity2.publicKey)

        assertTrue(client.queryManager.queryServers(identity2.publicKey).isEmpty())
        assertTrue(client.queryManager.queryTopics(identity2.publicKey).isEmpty())

        client.contentManager.createAddServer("https://identity2-server.com")
        client.contentManager.createJoinTopic("identity2-topic")

        assertEquals(listOf("https://identity2-server.com"), client.queryManager.queryServers(identity2.publicKey))
        assertEquals(listOf("identity2-topic"), client.queryManager.queryTopics(identity2.publicKey))

        client.identityManager.switchIdentity(identity1.publicKey)

        val servers1 = client.queryManager.queryServers(identity1.publicKey)
        val topics1 = client.queryManager.queryTopics(identity1.publicKey)
        assertEquals(listOf("https://identity1-server.com"), servers1)
        assertEquals(listOf("identity1-topic"), topics1)
        assertFalse(servers1.contains("https://identity2-server.com"))
        assertFalse(topics1.contains("identity2-topic"))
    }

    // LWW Semantics

    @Test
    fun shouldHandleLWWSemanticsForAddRemoveOperations() = runBlocking {
        val testServer = "https://lww-test.example.com"

        client.contentManager.createAddServer(testServer)
        assertTrue(client.queryManager.queryServers(client.currentIdentity.keyPair.publicKey).contains(testServer))

        client.contentManager.createRemoveServer(testServer)
        assertFalse(client.queryManager.queryServers(client.currentIdentity.keyPair.publicKey).contains(testServer))

        client.contentManager.createAddServer(testServer)
        assertTrue(client.queryManager.queryServers(client.currentIdentity.keyPair.publicKey).contains(testServer))
    }
}

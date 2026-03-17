package tech.futo.libPolycentric

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import polycentric.PublicKey
import okio.ByteString.Companion.toByteString
import tech.futo.libPolycentric.drivers.Ed25519CryptoManager
import tech.futo.libPolycentric.drivers.storage.memory.InMemoryStorageDriver
import tech.futo.libPolycentric.services.IdentityOptions

@RunWith(AndroidJUnit4::class)
class QueryManagerInstrumentedTest {

    private lateinit var client: PolycentricClient

    @Before
    fun setUp() {
        client = PolycentricClient(Ed25519CryptoManager(), InMemoryStorageDriver())
        client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519)
        )
        client.init()
    }

    @Test
    fun shouldReturnEmptyResultWhenNoEventsExist() {
        val emptySystem = PublicKey(
            key_type = 999L,
            key = byteArrayOf(1, 2, 3, 4, 5).toByteString(),
        )

        val feedResult = client.queryManager.queryFeed(emptySystem, limit = 10)

        assertNotNull(feedResult.events)
        assertEquals(0, feedResult.events.size)
    }

    @Test
    fun shouldQueryFeedEventsWithPagination() {
        client.contentManager.createPost("First post for feed testing")
        client.contentManager.createPost("Second post for feed testing")
        client.contentManager.createPost("Third post for feed testing")

        val feedResult1 = client.queryManager.queryFeed(
            client.currentIdentity.keyPair.publicKey,
            limit = 2,
        )

        assertNotNull(feedResult1.events)
        assertNotNull(feedResult1.cursor)
        assertTrue(feedResult1.events.size <= 2)

        if (feedResult1.cursor.size > 0) {
            val feedResult2 = client.queryManager.queryFeed(
                client.currentIdentity.keyPair.publicKey,
                limit = 2,
                cursor = feedResult1.cursor.toByteArray(),
            )

            assertNotNull(feedResult2.events)
            assertNotNull(feedResult2.cursor)
            assertTrue(feedResult2.events.size <= 2)
        }
    }

    @Test
    fun shouldQueryFeedEventsWithTimeRange() {
        client.contentManager.createPost("Time range test post")

        val now = System.currentTimeMillis()

        val feedResult = client.queryManager.queryFeed(
            client.currentIdentity.keyPair.publicKey,
            startTime = now - 60000,
            endTime = now,
            limit = 10,
        )

        assertNotNull(feedResult.events)
        assertNotNull(feedResult.cursor)
    }

    @Test
    fun shouldHandleCursorPaginationCorrectly() {
        for (i in 1..5) {
            client.contentManager.createPost("Post $i for pagination test")
        }

        val page1 = client.queryManager.queryFeed(
            client.currentIdentity.keyPair.publicKey,
            limit = 2,
        )

        assertEquals(2, page1.events.size)
        assertTrue(page1.cursor.size > 0)

        val page2 = client.queryManager.queryFeed(
            client.currentIdentity.keyPair.publicKey,
            limit = 2,
            cursor = page1.cursor.toByteArray(),
        )

        assertEquals(2, page2.events.size)
        assertTrue(page2.cursor.size > 0)

        val page3 = client.queryManager.queryFeed(
            client.currentIdentity.keyPair.publicKey,
            limit = 2,
            cursor = page2.cursor.toByteArray(),
        )

        assertTrue(page3.events.isNotEmpty())
    }

    @Test
    fun shouldQueryUsernameAfterSetting() {
        client.contentManager.createUsername("testuser")

        val username = client.queryManager.queryUsername(
            client.currentIdentity.keyPair.publicKey
        )

        assertEquals("testuser", username)
    }

    @Test
    fun shouldReturnNullUsernameWhenNotSet() {
        val username = client.queryManager.queryUsername(
            client.currentIdentity.keyPair.publicKey
        )

        assertNull(username)
    }

    @Test
    fun shouldQueryDescriptionAfterSetting() {
        client.contentManager.createDescription("A test description")

        val description = client.queryManager.queryDescription(
            client.currentIdentity.keyPair.publicKey
        )

        assertEquals("A test description", description)
    }

    @Test
    fun shouldReturnNullDescriptionWhenNotSet() {
        val description = client.queryManager.queryDescription(
            client.currentIdentity.keyPair.publicKey
        )

        assertNull(description)
    }

    @Test
    fun shouldQueryFollowsAfterFollowing() {
        val otherPublicKey = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        ).publicKey

        client.contentManager.createFollow(otherPublicKey)

        val follows = client.queryManager.queryFollows(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(follows.isNotEmpty())
        assertEquals(otherPublicKey.key, follows[0].key)
    }

    @Test
    fun shouldReturnEmptyFollowsWhenNoneExist() {
        val follows = client.queryManager.queryFollows(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(follows.isEmpty())
    }

    @Test
    fun shouldQueryBlocksAfterBlocking() {
        val otherPublicKey = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        ).publicKey

        client.contentManager.createBlock(otherPublicKey)

        val blocks = client.queryManager.queryBlocks(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(blocks.isNotEmpty())
        assertEquals(otherPublicKey.key, blocks[0].key)
    }

    @Test
    fun shouldQueryServersAfterAdding() {
        client.contentManager.createAddServer("https://example.com")

        val servers = client.queryManager.queryServers(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(servers.isNotEmpty())
        assertEquals("https://example.com", servers[0])
    }

    @Test
    fun shouldReturnEmptyServersWhenNoneExist() {
        val servers = client.queryManager.queryServers(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(servers.isEmpty())
    }

    @Test
    fun shouldQueryAuthoritiesAfterAdding() {
        client.contentManager.createAddAuthority("example.authority")

        val authorities = client.queryManager.queryAuthorities(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(authorities.isNotEmpty())
        assertEquals("example.authority", authorities[0])
    }

    @Test
    fun shouldQueryTopicsAfterJoining() {
        client.contentManager.createJoinTopic("test-topic")

        val topics = client.queryManager.queryTopics(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(topics.isNotEmpty())
        assertEquals("test-topic", topics[0])
    }

    @Test
    fun shouldReturnEmptyTopicsWhenNoneExist() {
        val topics = client.queryManager.queryTopics(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(topics.isEmpty())
    }

    @Test
    fun shouldQueryCurrentOpinionAfterLiking() {
        val post = client.contentManager.createPost("A post to like")
        val pointer = client.queryManager.eventPointer(
            polycentric.Event.ADAPTER.decode(post.event.toByteArray())
        )

        client.contentManager.createLike(pointer)

        val opinion = client.queryManager.queryCurrentOpinion(pointer)

        assertNotNull(opinion)
    }

    @Test
    fun shouldReturnNullOpinionWhenNoOpinionExists() {
        val post = client.contentManager.createPost("A post with no opinion")
        val pointer = client.queryManager.eventPointer(
            polycentric.Event.ADAPTER.decode(post.event.toByteArray())
        )

        val opinion = client.queryManager.queryCurrentOpinion(pointer)

        assertNull(opinion)
    }

    @Test
    fun shouldCheckDeletedStatusForDeletedPost() {
        val post = client.contentManager.createPost("A post to delete")
        val pointer = client.queryManager.eventPointer(
            polycentric.Event.ADAPTER.decode(post.event.toByteArray())
        )

        client.contentManager.deletePost(pointer)

        val isDeleted = client.queryManager.queryIsDeleted(pointer)

        assertTrue(isDeleted)
    }

    @Test
    fun shouldReturnNotDeletedForExistingPost() {
        val post = client.contentManager.createPost("A post that exists")
        val pointer = client.queryManager.eventPointer(
            polycentric.Event.ADAPTER.decode(post.event.toByteArray())
        )

        val isDeleted = client.queryManager.queryIsDeleted(pointer)

        assertFalse(isDeleted)
    }

    @Test
    fun shouldGetEventPointer() {
        val post = client.contentManager.createPost("A post for pointer test")
        val event = polycentric.Event.ADAPTER.decode(post.event.toByteArray())

        val pointer = client.queryManager.eventPointer(event)

        assertNotNull(pointer)
        assertNotNull(pointer.system)
        assertNotNull(pointer.process)
        assertNotNull(pointer.logical_clock)
    }

    @Test
    fun shouldGetEventKey() {
        val post = client.contentManager.createPost("A post for event key test")
        val event = polycentric.Event.ADAPTER.decode(post.event.toByteArray())

        val eventKey = client.queryManager.eventKey(event)

        assertNotNull(eventKey)
    }

    @Test
    fun shouldQueryLatestUsernameAfterMultipleUpdates() {
        client.contentManager.createUsername("first_username")
        client.contentManager.createUsername("second_username")
        client.contentManager.createUsername("final_username")

        val username = client.queryManager.queryUsername(
            client.currentIdentity.keyPair.publicKey
        )

        assertEquals("final_username", username)
    }

    @Test
    fun shouldQueryLatestDescriptionAfterMultipleUpdates() {
        client.contentManager.createDescription("first description")
        client.contentManager.createDescription("final description")

        val description = client.queryManager.queryDescription(
            client.currentIdentity.keyPair.publicKey
        )

        assertEquals("final description", description)
    }

    @Test
    fun shouldHandleFollowThenUnfollow() {
        val otherPublicKey = client.identityManager.createIdentity(
            IdentityOptions(keyType = Ed25519CryptoManager.KEY_TYPE_ED25519, setAsCurrent = false)
        ).publicKey

        client.contentManager.createFollow(otherPublicKey)
        client.contentManager.createUnfollow(otherPublicKey)

        val follows = client.queryManager.queryFollows(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(follows.isEmpty())
    }

    @Test
    fun shouldHandleServerAddThenRemove() {
        client.contentManager.createAddServer("https://temp-server.com")
        client.contentManager.createRemoveServer("https://temp-server.com")

        val servers = client.queryManager.queryServers(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(servers.isEmpty())
    }

    @Test
    fun shouldHandleTopicJoinThenLeave() {
        client.contentManager.createJoinTopic("temp-topic")
        client.contentManager.createLeaveTopic("temp-topic")

        val topics = client.queryManager.queryTopics(
            client.currentIdentity.keyPair.publicKey
        )

        assertTrue(topics.isEmpty())
    }
}

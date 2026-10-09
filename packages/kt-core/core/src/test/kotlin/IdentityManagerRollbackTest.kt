package org.futo.polycentric.core

import kotlinx.coroutines.test.runTest
import okio.ByteString.Companion.toByteString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import polycentric.v2.Identity
import polycentric.v2.IdentityBackup
import polycentric.v2.KeyType
import polycentric.v2.PrivateKey

/**
 * `claim` and `recoverIdentity` switch the client's active identity and
 * servers part-way through; a failure must restore both.
 */
class IdentityManagerRollbackTest {
    private val me = makeSigner(1)
    private val signingKey = makeSigner(2)
    private val newDevice = makeSigner(9)
    private val identityA = makeIdentity(listOf(me))
    private val identityB = makeIdentity(listOf(newDevice))
    private val head = identityHead(me)

    /** A client signed in to identity B, whose core resolves identity A's head. */
    private fun clientOnB(
        key: TestSigner,
        configure: FakeCoreOptions.() -> Unit = {},
    ) = makeClient {
        identity = identityB
        signer = key
        core =
            FakeCore {
                resolveIdentityResponse = Identity.ADAPTER.encode(head)
                configure()
            }
    }

    @Test
    fun `claim that loses authorization after adopting the identity is rolled back`() =
        runTest {
            var resolves = 0
            val revoked = head.copy(signing_keys = emptyList())
            val f =
                clientOnB(signingKey) {
                    resolveIdentity = {
                        resolves++
                        Identity.ADAPTER.encode(if (resolves == 1) head else revoked)
                    }
                }

            val error =
                runCatching {
                    f.client.identityManager.claim(identityA.key, servers = listOf("https://issuer"))
                }.exceptionOrNull()

            assertTrue("expected UnauthorizedKeyException, got $error", error is UnauthorizedKeyException)
            assertEquals(identityB.key, f.client.activeIdentityKey)
            assertEquals(identityB.key, f.storageDriver.session)
            assertEquals(listOf("http://server-1"), f.client.servers)
            assertNull(f.lastPublishedIdentity())
        }

    @Test
    fun `recoverIdentity with the wrong recovery key is rolled back`() =
        runTest {
            // The head's recovery key is makeSigner(4); this backup holds another key.
            val f = clientOnB(newDevice)
            val wrongKey = PrivateKey(key_type = KeyType.KEY_TYPE_ED25519, key = me.privateKey.toByteString())

            val error =
                runCatching {
                    f.client.identityManager.recoverIdentity(
                        IdentityBackup(identity_key = identityA.key, recovery_key = wrongKey),
                    )
                }.exceptionOrNull()

            assertTrue("expected PolycentricException, got $error", error is PolycentricException)
            assertEquals(identityB.key, f.client.activeIdentityKey)
            assertEquals(listOf("http://server-1"), f.client.servers)
            assertNull(f.lastPublishedIdentity())
        }
}

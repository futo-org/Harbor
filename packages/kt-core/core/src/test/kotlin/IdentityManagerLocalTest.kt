package org.futo.polycentric.core

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import polycentric.v2.Identity

/**
 * `IdentityManager.getCurrent()` maps the core's validated head, and
 * `publish()` validates its bootstrap arguments before any core call — both
 * testable with the sync fakes.
 */
class IdentityManagerLocalTest {
    private val signerA = makeSigner(1)
    private val identityA = makeIdentity(listOf(signerA), listOf(makeSigner(2)))

    @Test
    fun `getCurrent with no active identity returns an empty state`() =
        runTest {
            val f = makeClient { otherIdentities = listOf(identityA) } // seeded but NOT active

            val state = f.client.identityManager.getCurrent()

            assertNull(state.identityKey)
            assertEquals(emptyList<Any>(), state.rotationKeys)
            assertEquals(emptyList<Any>(), state.signingKeys)
            assertNull(state.servers)
        }

    @Test
    fun `bootstrap publish validation rejects bad key configurations`() =
        runTest {
            val f = makeClient { signer = signerA }

            // Signing keys present:
            val e1 =
                runCatching {
                    f.client.identityManager.publish(null, listOf(signerA.publicKey), listOf(makeSigner(7).publicKey))
                }.exceptionOrNull()
            assertTrue("expected PolycentricException, got $e1", e1 is PolycentricException)

            // Rotation key != current key:
            val e2 = runCatching { f.client.identityManager.publish(null, listOf(makeSigner(7).publicKey), emptyList()) }.exceptionOrNull()
            assertTrue("expected PolycentricException, got $e2", e2 is PolycentricException)

            // != 1 rotation key:
            val e3 =
                runCatching {
                    f.client.identityManager.publish(null, listOf(signerA.publicKey, makeSigner(7).publicKey), emptyList())
                }.exceptionOrNull()
            assertTrue("expected PolycentricException, got $e3", e3 is PolycentricException)
        }

    @Test
    fun `bootstrap publish derives the identity key as hex sha256 of the doc`() =
        runTest {
            val f = makeClient { signer = signerA }

            val result = f.client.identityManager.publish(null, listOf(signerA.publicKey), emptyList())

            val doc = Identity(rotation_keys = listOf(signerA.publicKey))
            assertEquals(
                sha256Hex(
                    polycentric.v2.Identity.ADAPTER
                        .encode(doc),
                ),
                result.identityKey,
            )
            assertEquals(result.identityKey, f.client.activeIdentityKey)
        }
}

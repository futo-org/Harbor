package org.futo.polycentric.core.http

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Port of js-core `http/alias-resolver.test.ts` — the `normalizeAlias`
 * (parsing) half. The js `resolveAlias` tests stub the global `fetch`;
 * Kotlin has no global to stub and `AliasResolver`'s OkHttpClient is
 * private, so the network half stays unported until the client is
 * injectable. The `isIdentityKey` tests below stand in for the js
 * resolveAlias assertions on identity-hex validation.
 */
class AliasResolverTest {

    // A format-valid identity: non-empty hex.
    private val hexIdentity =
        "0a2abecb223dbd572729018f8d201f32471e2a5b71e2032c052f6830846c4722"

    @Test
    fun `canonicalises a plain alias`() {
        assertEquals("user@domain.com", AliasResolver.normalizeAlias("user@domain.com"))
    }

    @Test
    fun `strips a single leading @`() {
        assertEquals("user@domain.com", AliasResolver.normalizeAlias("@user@domain.com"))
    }

    @Test
    fun `lowercases local part and domain`() {
        assertEquals("user@domain.com", AliasResolver.normalizeAlias("User@Domain.COM"))
    }

    @Test
    fun `trims surrounding whitespace`() {
        assertEquals("user@domain.com", AliasResolver.normalizeAlias("  user@domain.com  "))
    }

    @Test
    fun `accepts dotted local parts and multi-label domains`() {
        assertEquals(
            "user.name@sub.domain.com",
            AliasResolver.normalizeAlias("user.name@sub.domain.com"),
        )
    }

    @Test
    fun `accepts a bare domain as wildcard alias`() {
        assertEquals("domain.com", AliasResolver.normalizeAlias("Domain.COM"))
        assertEquals("domain.com", AliasResolver.normalizeAlias("@domain.com"))
        assertEquals("domain.com", AliasResolver.normalizeAlias("  domain.com  "))
        assertEquals("sub.domain.com", AliasResolver.normalizeAlias("sub.domain.com"))
    }

    @Test
    fun `rejects malformed aliases`() {
        val cases = listOf(
            "empty" to "",
            "lone @" to "@",
            "single-label bare domain" to "nodomain",
            "empty label in bare domain" to "domain..com",
            "trailing dot in bare domain" to "domain.com.",
            "bare domain with path" to "domain.com/path",
            "literal wildcard local part" to "*@domain.com",
            "multiple @" to "a@@b.com",
            "single-label domain" to "user@localhost",
            "underscore in domain label" to "user@dom_ain.com",
            "hyphen-leading domain label" to "user@-domain.com",
            "space in local part" to "us er@domain.com",
            "disallowed local char (+)" to "user+tag@domain.com",
        )
        for ((label, input) in cases) {
            assertNull("rejects $label -> null", AliasResolver.normalizeAlias(input))
        }
    }

    @Test
    fun `isIdentityKey accepts non-empty hex`() {
        assertTrue(AliasResolver.isIdentityKey(hexIdentity))
        assertTrue(AliasResolver.isIdentityKey("ABCDEF01"))
    }

    @Test
    fun `isIdentityKey rejects empty and non-hex strings`() {
        assertFalse(AliasResolver.isIdentityKey(""))
        assertFalse(AliasResolver.isIdentityKey("not_hex_zz"))
    }
}

package org.futo.polycentric.core

import org.junit.Assert.assertEquals
import org.junit.Test

/** Port of js-core `utils/moderation.test.ts`. */
class ModerationTest {

    @Test
    fun `decodes the JSON serverUrl to bool map`() {
        val data = """{"http://a":true,"http://b":false}""".toByteArray(Charsets.UTF_8)

        assertEquals(
            mapOf("http://a" to true, "http://b" to false),
            Moderation.decodeStatusByServer(data),
        )
    }

    @Test
    fun `decodes an empty payload to an empty map`() {
        assertEquals(emptyMap<String, Boolean>(), Moderation.decodeStatusByServer(ByteArray(0)))
    }

    @Test
    fun `round-trips through encodeStatusByServer`() {
        val statusByServer = mapOf("http://a" to true, "http://b" to false)

        assertEquals(
            statusByServer,
            Moderation.decodeStatusByServer(Moderation.encodeStatusByServer(statusByServer)),
        )
    }
}

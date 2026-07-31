package org.futo.polycentric.core

/**
 * Port of js-core `utils/moderation.ts` — wire helpers for the fan-out
 * moderation queries (`Query.IsModerator` / `Query.IsBanned`). Unlike
 * other queries, their merged response is not a protobuf message but a
 * JSON `serverUrl -> bool` map assembled by the rust core, so consumers
 * decode it with these helpers instead of a generated proto adapter.
 */
object Moderation {

    /**
     * Decode the merged `serverUrl -> bool` JSON map emitted by the
     * fan-out moderation queries. A server that failed to respond is
     * absent from the map; an empty payload decodes to an empty map.
     */
    fun decodeStatusByServer(data: ByteArray): Map<String, Boolean> {
        if (data.isEmpty()) return emptyMap()
        val json = org.json.JSONObject(String(data, Charsets.UTF_8))
        val out = mutableMapOf<String, Boolean>()
        for (key in json.keys()) {
            out[key] = json.getBoolean(key)
        }
        return out
    }

    /**
     * Encode a `serverUrl -> bool` map back into the moderation queries'
     * wire form — for patching a cached query result after a local
     * `setBanStatus` mutation.
     */
    fun encodeStatusByServer(statusByServer: Map<String, Boolean>): ByteArray {
        val json = org.json.JSONObject()
        for ((server, status) in statusByServer) {
            json.put(server, status)
        }
        return json.toString().toByteArray(Charsets.UTF_8)
    }
}

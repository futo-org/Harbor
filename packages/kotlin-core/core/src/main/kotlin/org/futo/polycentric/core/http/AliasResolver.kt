package org.futo.polycentric.core.http

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

/**
 * Port of js-core `http/alias-resolver.ts` — maps an alias like
 * `user@domain.com` to the polycentric identity it points at, via the
 * domain's `/.well-known/polycentric.json`.
 */
object AliasResolver {

    /** Give up on a slow/unresponsive domain rather than hang the resolver. */
    private const val RESOLVE_TIMEOUT_MS = 10_000L

    private val http = OkHttpClient.Builder()
        .callTimeout(RESOLVE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        .build()

    /** Whether `s` is a polycentric identity string (non-empty hex). */
    fun isIdentityKey(s: String): Boolean =
        s.isNotEmpty() && s.all { it in "0123456789abcdefABCDEF" }

    // Conservative allow-list for an alias's local part — deliberately
    // tighter than RFC 7565's `userpart`: letters, digits, dot,
    // underscore, hyphen.
    private fun isLocalChar(c: Char): Boolean =
        c.isLetterOrDigit() && c.code < 128 || c == '.' || c == '_' || c == '-'

    /** A DNS label: 1+ of `[A-Za-z0-9-]`, not starting or ending with a hyphen. */
    private fun isHostLabel(label: String): Boolean {
        if (label.isEmpty() || label.startsWith("-") || label.endsWith("-")) return false
        return label.all { (it in 'a'..'z') || (it in 'A'..'Z') || (it in '0'..'9') || it == '-' }
    }

    private class ParsedAlias(val acct: String, val local: String, val domain: String)

    /**
     * Parse an alias into its `acct` form and domain. Accepts
     * `user@domain.com` with an optional leading `@`. A bare domain
     * points at the domain's wildcard entry (`*`). Returns null when
     * malformed.
     */
    private fun parseAlias(alias: String): ParsedAlias? {
        var acct = alias.trim()
        if (acct.startsWith("@")) acct = acct.substring(1)

        val parts = acct.split("@")
        val local: String
        val domain: String
        when (parts.size) {
            1 -> {
                local = "*"
                domain = parts[0]
            }
            2 -> {
                // Lowercase so query, names-map lookup, and comparison
                // share one canonical form.
                local = parts[0].lowercase()
                domain = parts[1]
                if (local.isEmpty() || !local.all(::isLocalChar)) return null
            }
            else -> return null
        }

        // Domain: a dotted hostname — two or more non-empty LDH labels.
        val labels = domain.split(".")
        if (labels.size < 2 || !labels.all(::isHostLabel)) return null

        return ParsedAlias(acct, local, domain)
    }

    /**
     * Canonicalise an alias for equality comparison: its parsed `acct`,
     * lowercased. Returns null when malformed.
     */
    fun normalizeAlias(alias: String): String? = parseAlias(alias)?.acct?.lowercase()

    /**
     * Resolve an alias (`user@domain.com`) to a polycentric identity.
     *
     * Returns null when the alias is malformed, the lookup fails
     * (network error, timeout, non-2xx, unparseable body), or the
     * domain's `polycentric.json` carries no entry for the alias.
     */
    suspend fun resolveAlias(alias: String): String? = withContext(Dispatchers.IO) {
        val parsed = parseAlias(alias) ?: return@withContext null

        val url = "https://${parsed.domain}/.well-known/polycentric.json" +
            "?alias=${java.net.URLEncoder.encode(parsed.local, "UTF-8")}"

        val identity = runCatching {
            http.newCall(
                Request.Builder().url(url).header("accept", "application/json").build(),
            ).execute().use { response ->
                // Non-2xx just means the domain doesn't know this alias.
                if (!response.isSuccessful) return@use null
                val body = response.body?.string() ?: return@use null
                JSONObject(body).optJSONObject("names")?.optString(parsed.local, "")
                    ?.takeIf { it.isNotEmpty() }
            }
        }.getOrNull()

        identity?.takeIf { isIdentityKey(it) }
    }
}

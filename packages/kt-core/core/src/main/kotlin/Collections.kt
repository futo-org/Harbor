package org.futo.polycentric.core

/**
 * Reserved collection IDs for `EventKey.collection`.
 *
 * The proto field is a plain int32 — there is deliberately no enum in the
 * schema (arbitrary collections are allowed); the reserved values are
 * documented in protos/polycentric/v2/event_key.proto and mirrored in
 * js-core src/constants.ts and rs-common src/models/collections.rs.
 * Keep all three in sync.
 */
object Collections {
    const val IDENTITY = 1
    const val FEED = 2
    const val PROFILE = 3
    const val INTERACTIONS = 4
    const val GRAPH = 5
    const val REPORTS = 6
    const val LABELS = 7
    const val VERIFICATIONS = 8
}

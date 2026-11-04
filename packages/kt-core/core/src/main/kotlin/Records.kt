package org.futo.polycentric.core

import org.futo.polycentric.ffi.Content
import org.futo.polycentric.ffi.ContentBody
import org.futo.polycentric.ffi.ContentDigest
import org.futo.polycentric.ffi.Event
import org.futo.polycentric.ffi.EventBundle
import org.futo.polycentric.ffi.EventKey
import org.futo.polycentric.ffi.LoginId
import org.futo.polycentric.ffi.PublicKey

/** The bundle's signed event, decoded. */
val EventBundle.event: Event? get() = signedEvent?.event

/** The bundle's event key. */
val EventBundle.key: EventKey? get() = event?.key

/** The bundle's content, decoded. */
val EventBundle.content: Content? get() = serializedContent?.content

/** The bundle's content body (post, profile update, claim, ...). */
val EventBundle.body: ContentBody? get() = content?.contentBody

/** [Content] holding [this] body. */
fun ContentBody.toContent(): Content = Content(this)

// Generated records hold bytes as ByteArray, which `equals` compares by
// reference; these compare keys by value.

/** Whether [other] is the same key. */
fun PublicKey.contentEquals(other: PublicKey?): Boolean = other != null && keyType == other.keyType && key.contentEquals(other.key)

/** Whether [other] is the same digest. */
fun ContentDigest.contentEquals(other: ContentDigest?): Boolean = other != null && type == other.type && value.contentEquals(other.value)

/** Whether [other] names the same login. */
fun LoginId.contentEquals(other: LoginId?): Boolean =
    other != null && identity == other.identity && publicKey.contentEquals(other.publicKey)

/** Whether [other] names the same event. */
fun EventKey.contentEquals(other: EventKey?): Boolean =
    other != null &&
        collection == other.collection &&
        identity == other.identity &&
        sequence == other.sequence &&
        (signedBy?.contentEquals(other.signedBy) ?: (other.signedBy == null))

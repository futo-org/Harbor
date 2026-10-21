package org.futo.polycentric.core

import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import polycentric.v2.Blob
import polycentric.v2.Content
import polycentric.v2.ContentDigest
import polycentric.v2.ContentDigestType
import polycentric.v2.Event
import polycentric.v2.EventBundle
import polycentric.v2.EventKey
import polycentric.v2.Identity
import polycentric.v2.Image
import polycentric.v2.ImageSet
import polycentric.v2.Post
import polycentric.v2.PublicKey
import polycentric.v2.PutEventError
import polycentric.v2.PutEventsResponse
import polycentric.v2.SerializedContent
import polycentric.v2.SignedEvent
import java.security.MessageDigest

// Deterministic data helpers — 1:1 port of the fixtures at the top of
// js-core `polycentric-client.sync.test.ts`. Signatures are produced by
// real Ed25519 (BouncyCastle, the same implementation
// [Ed25519CryptoManager] wraps), so the fixtures are valid v2 events.

/** A keypair used to sign events (rotation key or signing key). */
class TestSigner(
    val privateKey: ByteArray,
    val publicKey: PublicKey,
)

/** An Ed25519 keypair for rotation or signing keys; private key is `seed` repeated. */
fun makeSigner(seed: Int): TestSigner {
    val privateKey = ByteArray(32) { seed.toByte() }
    val publicBytes = Ed25519PrivateKeyParameters(privateKey, 0).generatePublicKey().encoded
    return TestSigner(
        privateKey = privateKey,
        publicKey = PublicKey(key_type = polycentric.v2.KeyType.KEY_TYPE_ED25519, key = publicBytes.toByteString()),
    )
}

/** An identity and the identity-collection data that backs it. */
class TestIdentity(
    val key: String,
    val rotationKeys: List<TestSigner>,
    val signingKeys: List<TestSigner>,
    val identityEvents: List<SignedEvent>,
    val identityContents: List<Pair<ContentDigest, Content>>,
)

/**
 * Build an identity whose key is derived exactly as `IdentityManager.publish()`
 * does: the hex sha256 of the serialized initial Identity document. All
 * authorized keys live in that single initial document.
 */
fun makeIdentity(
    rotationKeys: List<TestSigner>,
    signingKeys: List<TestSigner> = emptyList(),
): TestIdentity {
    val initialDoc =
        Identity(
            rotation_keys = rotationKeys.map { it.publicKey },
            signing_keys = signingKeys.map { it.publicKey },
        )
    val key = sha256Hex(Identity.ADAPTER.encode(initialDoc))

    val content = Content(identity = initialDoc)
    val event =
        makeSignedEvent(
            MakeEventArgs(
                signer = rotationKeys[0],
                identity = key,
                collection = Collections.IDENTITY,
                sequence = 1,
                identitySequence = 1,
                content = content,
            ),
        )

    return TestIdentity(
        key = key,
        rotationKeys = rotationKeys,
        signingKeys = signingKeys,
        identityEvents = listOf(event),
        identityContents = listOf(buildDigest(content) to content),
    )
}

/** A Blob proto whose digest is the sha256 of [bytes]. */
fun makeBlob(
    bytes: ByteArray,
    mimeType: String = "image/png",
): Blob =
    Blob(
        digest =
            ContentDigest(
                type = ContentDigestType.CONTENT_DIGEST_TYPE_SHA256,
                value_ = sha256(bytes).toByteString(),
            ),
        mime_type = mimeType,
        size = bytes.size.toLong(),
    )

/** A post Content, optionally referencing blobs via a single ImageSet. */
fun makeContent(
    text: String,
    blobs: List<Blob> = emptyList(),
): Content {
    val images =
        if (blobs.isEmpty()) {
            emptyList()
        } else {
            listOf(ImageSet(images = blobs.map { Image(blob = it) }))
        }
    return Content(post = Post(text = text, images = images))
}

fun buildDigest(content: Content): ContentDigest =
    ContentDigest(
        type = ContentDigestType.CONTENT_DIGEST_TYPE_SHA256,
        value_ = sha256(Content.ADAPTER.encode(content)).toByteString(),
    )

class MakeEventArgs(
    val signer: TestSigner,
    /** Either an identity key hex or a [TestIdentity]. */
    val identity: Any,
    val collection: Int,
    val sequence: Long,
    val content: Content,
    val identitySequence: Long = 1L,
    val createdAt: Long = 1_700_000_000_000L,
)

/** A signed v2 event; the signature covers the serialized Event bytes. */
fun makeSignedEvent(args: MakeEventArgs): SignedEvent {
    val identityKey = if (args.identity is TestIdentity) args.identity.key else args.identity as String
    val event =
        Event(
            key =
                EventKey(
                    collection = args.collection,
                    identity = identityKey,
                    signed_by = args.signer.publicKey,
                    sequence = args.sequence,
                ),
            identity_sequence = args.identitySequence,
            previous_signature = ByteString.EMPTY,
            previous_root = ByteString.EMPTY,
            content_digest = buildDigest(args.content),
            created_at = args.createdAt,
        )
    val eventBytes = Event.ADAPTER.encode(event)
    val signature = ed25519Sign(eventBytes, args.signer.privateKey)
    return SignedEvent(signature = signature.toByteString(), event_bytes = eventBytes.toByteString())
}

/**
 * A contiguous run of events (sequences 1..count) for a single
 * (identity, signer, collection) stream; the head is the highest sequence.
 */
fun makeStream(
    signer: TestSigner,
    identity: Any,
    collection: Int,
    count: Int,
    label: String,
): List<SignedEvent> =
    (1..count).map { sequence ->
        makeSignedEvent(
            MakeEventArgs(
                signer = signer,
                identity = identity,
                collection = collection,
                sequence = sequence.toLong(),
                content = makeContent("$label-$sequence"),
            ),
        )
    }

fun makeBundle(
    signedEvent: SignedEvent,
    content: Content? = null,
): EventBundle =
    EventBundle(
        signed_event = signedEvent,
        serialized_content = content?.let { SerializedContent(content_bytes = Content.ADAPTER.encode(it).toByteString()) },
        event_proofs = emptyList(),
    )

fun putEventsResponse(
    requestedBlobs: List<Blob> = emptyList(),
    errors: List<PutEventError> = emptyList(),
): ByteArray = PutEventsResponse.ADAPTER.encode(PutEventsResponse(errors = errors, requested_blobs = requestedBlobs))

fun ed25519Sign(
    message: ByteArray,
    privateKey: ByteArray,
): ByteArray {
    val signer = Ed25519Signer()
    signer.init(true, Ed25519PrivateKeyParameters(privateKey, 0))
    signer.update(message, 0, message.size)
    return signer.generateSignature()
}

fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)

fun sha256Hex(bytes: ByteArray): String = sha256(bytes).joinToString("") { "%02x".format(it) }

fun ByteArray.hex(): String = joinToString("") { "%02x".format(it) }

/** Digest-map key used by `trySaveContent`/`blobUrls`: `"${type.value}_${hex}"`. */
fun digestKey(digest: ContentDigest): String = "${digest.type.value}_${digest.value_.hex()}"

/** Canonical string identity of an EventKey, used as the fake store's map key. */
fun eventKeyString(key: EventKey): String =
    "${key.collection}|${key.identity}|${
        key.signed_by?.let { "${it.key_type.value}:${it.key.hex()}" } ?: "?"
    }|${key.sequence}"

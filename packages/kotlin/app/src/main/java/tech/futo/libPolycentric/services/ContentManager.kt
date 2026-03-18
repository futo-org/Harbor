package tech.futo.libPolycentric.services

import PolycentricException
import okio.ByteString
import okio.ByteString.Companion.toByteString
import polycentric.*
import tech.futo.libPolycentric.PolycentricClient

class ContentManager(private val client: PolycentricClient) {
    private suspend fun createLWWElementSetEvent(
        contentType: ContentType,
        value: ByteArray,
        operation: LWWElementSet.Operation,
    ): SignedEvent {
        val lwwElementSet = LWWElementSet(
            operation = operation,
            value_ = value.toByteString(),
            unix_milliseconds = System.currentTimeMillis(),
        )

        val eventData = EventCreationData(
            content_type = contentType,
            lww_element_set = lwwElementSet,
            system = PublicKey(
                key_type = client.currentIdentity.keyPair.keyType,
                key = client.currentIdentity.keyPair.publicKey.key,
            ),
            process = Process(
                process = client.process!!.process,
            ),
        )

        return createEvent(eventData)
    }

    private suspend fun getReference(pointer: Pointer): EventKey? {
        val pointerBytes = Pointer.ADAPTER.encode(pointer)
        val result = this.client.ffiService.getReference(pointerBytes)
        if (result.isEmpty()) return null
        return EventKey.ADAPTER.decode(result)
    }

    private suspend fun createOpinion(opinion: Opinion, subjectPointer: Pointer): SignedEvent {
        getReference(subjectPointer)
            ?: throw PolycentricException("Could not get reference from pointer")

        val subjectReference = Reference(
            reference_type = 2L,
            reference = Pointer.ADAPTER.encode(subjectPointer).toByteString(),
        )

        val lwwElement = LWWElement(
            value_ = byteArrayOf(opinion.value.toByte()).toByteString(),
            unix_milliseconds = System.currentTimeMillis(),
        )

        val eventData = EventCreationData(
            content_type = ContentType.OPINION,
            lww_element = lwwElement,
            references = listOf(subjectReference),
            system = PublicKey(
                key_type = client.currentIdentity.keyPair.keyType,
                key = client.currentIdentity.keyPair.publicKey.key,
            ),
            process = Process(
                process = client.process!!.process,
            ),
        )

        return createEvent(eventData)
    }

    private suspend fun createDelete(targetPointer: Pointer, contentType: ContentType): SignedEvent {
        val deleteEvent = Delete(
            process = targetPointer.process,
            logical_clock = targetPointer.logical_clock,
            unix_milliseconds = System.currentTimeMillis(),
            indices = Indices(),
            content_type = contentType,
        )

        val eventData = EventCreationData(
            content_type = ContentType.DELETE,
            content = Delete.ADAPTER.encode(deleteEvent).toByteString(),
            references = listOf(
                Reference(
                    reference_type = 2L,
                    reference = Pointer.ADAPTER.encode(targetPointer).toByteString(),
                )
            ),
            system = PublicKey(
                key_type = client.currentIdentity.keyPair.keyType,
                key = client.currentIdentity.keyPair.publicKey.key,
            ),
            process = Process(
                process = client.process!!.process,
            ),
        )

        return createEvent(eventData)
    }

    suspend fun createEvent(eventData: EventCreationData): SignedEvent {
        val identity = client.currentIdentity
        val processBytes = identity.process.process.toByteArray()
        val systemKeyType = identity.keyPair.keyType
        val systemKeyBytes = identity.keyPair.publicKey.key.toByteArray()

        val logicalClock = client.processStateRepository.getNextLogicalClock(
            systemKeyType,
            systemKeyBytes,
            processBytes,
        )

        val eventDataWithClock = eventData.copy(logical_clock = logicalClock)
        val eventDataBytes = EventCreationData.ADAPTER.encode(eventDataWithClock)
        val unixMs = System.currentTimeMillis().toInt()

        val event = client.ffiService.createEvent(eventDataBytes, unixMs)
        val signature = client.identityManager.sign(event.toByteString())

        val signedEvent = SignedEvent(event = event.toByteString(), signature = signature)

        client.ffiService.ingestEvent(signedEvent.encode())

        client.eventRepository.persistEvent(signedEvent)
        client.processStateRepository.persistCurrentLogicalClock(
            systemKeyType,
            systemKeyBytes,
            processBytes,
            logicalClock,
        )

        client.events.emitContentCreated(Event.ADAPTER.decode(event))

        return signedEvent
    }

    suspend fun createPost(content: String, image: ImageManifest? = null, reference: Reference? = null): SignedEvent {
        val post = Post(content = content, image = image)

        val eventData = EventCreationData(
            content_type = ContentType.POST,
            content = Post.ADAPTER.encode(post).toByteString(),
            references = if (reference != null) listOf(reference) else emptyList(),
            system = PublicKey(
                key_type = client.currentIdentity.keyPair.keyType,
                key = client.currentIdentity.keyPair.publicKey.key,
            ),
            process = Process(
                process = client.process!!.process,
            ),
        )

        return createEvent(eventData)
    }

    suspend fun createLike(subjectPointer: Pointer): SignedEvent =
        createOpinion(Opinion.LIKE, subjectPointer)

    suspend fun createDislike(subjectPointer: Pointer): SignedEvent =
        createOpinion(Opinion.DISLIKE, subjectPointer)

    suspend fun createNeutral(subjectPointer: Pointer): SignedEvent =
        createOpinion(Opinion.NEUTRAL, subjectPointer)

    suspend fun createUsername(username: String): SignedEvent {
        val lwwElement = LWWElement(
            value_ = username.encodeToByteArray().toByteString(),
            unix_milliseconds = System.currentTimeMillis(),
        )

        val eventData = EventCreationData(
            content_type = ContentType.USERNAME,
            lww_element = lwwElement,
            system = PublicKey(
                key_type = client.currentIdentity.keyPair.keyType,
                key = client.currentIdentity.keyPair.publicKey.key,
            ),
            process = Process(
                process = client.process!!.process,
            ),
        )

        return createEvent(eventData)
    }

    suspend fun createDescription(description: String): SignedEvent {
        val lwwElement = LWWElement(
            value_ = description.encodeToByteArray().toByteString(),
            unix_milliseconds = System.currentTimeMillis(),
        )

        val eventData = EventCreationData(
            content_type = ContentType.DESCRIPTION,
            lww_element = lwwElement,
            system = PublicKey(
                key_type = client.currentIdentity.keyPair.keyType,
                key = client.currentIdentity.keyPair.publicKey.key,
            ),
            process = Process(
                process = client.process!!.process,
            ),
        )

        return createEvent(eventData)
    }

    suspend fun createAvatar(avatar: ImageManifest): SignedEvent {
        val lwwElement = LWWElement(
            value_ = ImageManifest.ADAPTER.encode(avatar).toByteString(),
            unix_milliseconds = System.currentTimeMillis(),
        )

        val eventData = EventCreationData(
            content_type = ContentType.AVATAR,
            lww_element = lwwElement,
            system = PublicKey(
                key_type = client.currentIdentity.keyPair.keyType,
                key = client.currentIdentity.keyPair.publicKey.key,
            ),
            process = Process(
                process = client.process!!.process,
            ),
        )

        return createEvent(eventData)
    }

    suspend fun createBanner(banner: ImageManifest): SignedEvent {
        val lwwElement = LWWElement(
            value_ = ImageManifest.ADAPTER.encode(banner).toByteString(),
            unix_milliseconds = System.currentTimeMillis(),
        )

        val eventData = EventCreationData(
            content_type = ContentType.BANNER,
            lww_element = lwwElement,
            system = PublicKey(
                key_type = client.currentIdentity.keyPair.keyType,
                key = client.currentIdentity.keyPair.publicKey.key,
            ),
            process = Process(
                process = client.process!!.process,
            ),
        )

        return createEvent(eventData)
    }

    suspend fun createFollow(system: PublicKey): SignedEvent =
        createLWWElementSetEvent(ContentType.FOLLOW, PublicKey.ADAPTER.encode(system), LWWElementSet.Operation.ADD)

    suspend fun createUnfollow(system: PublicKey): SignedEvent =
        createLWWElementSetEvent(ContentType.FOLLOW, PublicKey.ADAPTER.encode(system), LWWElementSet.Operation.REMOVE)

    suspend fun createBlock(system: PublicKey): SignedEvent =
        createLWWElementSetEvent(ContentType.BLOCK, PublicKey.ADAPTER.encode(system), LWWElementSet.Operation.ADD)

    suspend fun createUnblock(system: PublicKey): SignedEvent =
        createLWWElementSetEvent(ContentType.BLOCK, PublicKey.ADAPTER.encode(system), LWWElementSet.Operation.REMOVE)

    suspend fun createAddServer(server: String): SignedEvent =
        createLWWElementSetEvent(ContentType.SERVER, server.encodeToByteArray(), LWWElementSet.Operation.ADD)

    suspend fun createRemoveServer(server: String): SignedEvent =
        createLWWElementSetEvent(ContentType.SERVER, server.encodeToByteArray(), LWWElementSet.Operation.REMOVE)

    suspend fun createAddAuthority(authority: String): SignedEvent =
        createLWWElementSetEvent(ContentType.AUTHORITY, authority.encodeToByteArray(), LWWElementSet.Operation.ADD)

    suspend fun createRemoveAuthority(authority: String): SignedEvent =
        createLWWElementSetEvent(ContentType.AUTHORITY, authority.encodeToByteArray(), LWWElementSet.Operation.REMOVE)

    suspend fun createJoinTopic(topic: String): SignedEvent =
        createLWWElementSetEvent(ContentType.JOIN_TOPIC, topic.encodeToByteArray(), LWWElementSet.Operation.ADD)

    suspend fun createLeaveTopic(topic: String): SignedEvent =
        createLWWElementSetEvent(ContentType.JOIN_TOPIC, topic.encodeToByteArray(), LWWElementSet.Operation.REMOVE)

    suspend fun createClaim(claimType: Long, fields: List<ClaimFieldEntry>): SignedEvent {
        val claim = Claim(
            claim_type = claimType,
            fields = fields,
        )

        val eventData = EventCreationData(
            content_type = ContentType.CLAIM,
            content = Claim.ADAPTER.encode(claim).toByteString(),
            system = PublicKey(
                key_type = client.currentIdentity.keyPair.keyType,
                key = client.currentIdentity.keyPair.publicKey.key,
            ),
            process = Process(
                process = client.process!!.process,
            ),
        )

        return createEvent(eventData)
    }

    suspend fun createVerifyClaim(targetPointer: Pointer): SignedEvent {
        val targetReference = Reference(
            reference_type = 0L,
            reference = Pointer.ADAPTER.encode(targetPointer).toByteString(),
        )

        val eventData = EventCreationData(
            content_type = ContentType.VOUCH,
            references = listOf(targetReference),
            system = PublicKey(
                key_type = client.currentIdentity.keyPair.keyType,
                key = client.currentIdentity.keyPair.publicKey.key,
            ),
            process = Process(
                process = client.process!!.process,
            ),
        )

        return createEvent(eventData)
    }

    suspend fun deletePost(postPointer: Pointer): SignedEvent =
        createDelete(postPointer, ContentType.POST)
}

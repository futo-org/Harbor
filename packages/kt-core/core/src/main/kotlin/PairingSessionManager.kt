package org.futo.polycentric.core

import okio.ByteString.Companion.toByteString
import polycentric.v2.InitialPairingSession
import polycentric.v2.JoinPairingSessionBody
import polycentric.v2.PairingSession
import polycentric.v2.PublicKey
import polycentric.v2.SignedMessage

/**
 * Port of js-core `client-internal/pairing-session-manager.ts` — the
 * device-pairing handshake. Transport is entirely in the core
 * (`createPairingSession` / `getPairingSession` / `joinPairingSession`);
 * this manager builds and signs the payloads.
 *
 * Flow: an existing device creates a session for its identity; the new
 * device joins it with its own key; the existing device polls the
 * session, sees the claimer key, and calls
 * `IdentityManager.addSigningKey` — the new device then `claim()`s.
 */
class PairingSessionManager(private val client: PolycentricClient) {

    class ActivePairingSession(
        /** Hex signature of the signed InitialPairingSession — the session id/code. */
        val code: String,
        val identityKey: String,
        val createdAt: Long,
        val expiresAt: Long,
        val signedBy: PublicKey,
        val claimers: List<PublicKey>,
        val server: String,
    )

    class PairingSessionView(
        val session: PairingSession,
        val issuerIdentity: String,
        val createdAt: Long,
        val expiresAt: Long,
        val signedBy: PublicKey?,
        /** Public keys that have joined the session so far. */
        val claimers: List<PublicKey>,
    )

    private suspend fun signMessage(messageBytes: ByteArray): SignedMessage {
        val keyPair = client.currentKeyPair ?: throw NoActiveKeyPairException()
        val signature = client.crypto.sign(keyPair.privateKey, messageBytes, keyPair.keyType)
        return SignedMessage(
            signature = signature.toByteString(),
            message_bytes = messageBytes.toByteString(),
            public_key = keyPair.toPublicKeyProto(),
        )
    }

    /**
     * Creates a signed pairing session and registers it on the target
     * server. The returned `code` (signature hex) is what the joining
     * device presents.
     */
    suspend fun createPairingSessionOnServer(
        identityKey: String,
        server: String,
    ): ActivePairingSession {
        val payloadBytes = InitialPairingSession.ADAPTER.encode(
            InitialPairingSession(
                issuer_identity = identityKey,
                timestamp = System.currentTimeMillis(),
            ),
        )
        val signedMessage = signMessage(payloadBytes)

        val sessionBytes = client.core.createPairingSession(
            server,
            SignedMessage.ADAPTER.encode(signedMessage),
        )
        val session = PairingSession.ADAPTER.decode(sessionBytes)

        return ActivePairingSession(
            code = signedMessage.signature.hex(),
            identityKey = session.issuer_identity,
            createdAt = session.created_at,
            expiresAt = session.expires_at,
            signedBy = session.signed_by ?: throw PolycentricException("Session missing signed_by"),
            claimers = emptyList(),
            server = server,
        )
    }

    /** Fetch a session's current state (poll while waiting for claimers). */
    suspend fun getPairingSessionStatus(
        pairingSessionSignature: String,
        server: String? = null,
    ): PairingSessionView {
        val targetServer = server ?: client.servers.firstOrNull()
            ?: throw PolycentricException("No servers configured")

        val sessionBytes = client.core.getPairingSession(targetServer, pairingSessionSignature)
        return PairingSession.ADAPTER.decode(sessionBytes).toView()
    }

    /** Join a session as a claimer, signing the join body with our key. */
    suspend fun joinPairingSession(
        pairingSessionSignature: String,
        server: String,
    ): PairingSessionView {
        val bodyBytes = JoinPairingSessionBody.ADAPTER.encode(
            JoinPairingSessionBody(pairing_session_signature = pairingSessionSignature),
        )
        val signedMessage = signMessage(bodyBytes)

        val sessionBytes = client.core.joinPairingSession(
            server,
            SignedMessage.ADAPTER.encode(signedMessage),
        )
        return PairingSession.ADAPTER.decode(sessionBytes).toView()
    }

    private fun PairingSession.toView() = PairingSessionView(
        session = this,
        issuerIdentity = issuer_identity,
        createdAt = created_at,
        expiresAt = expires_at,
        signedBy = signed_by,
        claimers = claimer_pubkeys,
    )
}

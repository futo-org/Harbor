package tech.futo.libPolycentric.services

import okio.ByteString
import polycentric.PrivateKey
import polycentric.Process
import polycentric.PublicKey
import tech.futo.libPolycentric.PolycentricClient

class Identity(val key: PublicKey, val process: Process) {}

class IdentityManager(private val client: PolycentricClient) {
    internal fun sign(bytes: ByteString): ByteString {
        return bytes // TODO signatures
    }

    public fun currentIdentity(): Identity {
        return Identity(key = PublicKey(0), Process())
    }
}
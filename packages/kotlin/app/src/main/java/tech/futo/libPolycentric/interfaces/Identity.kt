package tech.futo.libPolycentric.interfaces

import polycentric.PrivateKey
import polycentric.Process
import polycentric.PublicKey

interface KeyPair {
    val keyType: Int
    val privateKey: PrivateKey
    val publicKey: PublicKey
}

interface Identity {
    val keyPair: KeyPair
    val process: Process
}
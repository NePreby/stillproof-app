package io.github.stillprooflabs.keys

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec

private const val ALIAS = "stillproof-claim"
private const val PROVIDER = "AndroidKeyStore"
private val CHALLENGE = "stillproof/key/v1".toByteArray(Charsets.UTF_8)

/** The claim key in AndroidKeyStore: StrongBox if the device has it, else the TEE. */
class StillproofKeysModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StillproofKeys")

    // Replaces any existing key. Returns {publicKey, level}.
    AsyncFunction("generateKey") {
      keyStore().deleteEntry(ALIAS)
      describe(generate())
    }

    // {publicKey, level} of the stored key, or null.
    AsyncFunction("loadKey") {
      if (keyStore().containsAlias(ALIAS)) describe(null) else null
    }

    // SEC1 uncompressed public key, 65 bytes, lowercase hex.
    AsyncFunction("publicKey") {
      bytesToHex(publicKeyBytes(keyStore()))
    }

    // The attestation chain, base64 DER, leaf first.
    AsyncFunction("attestationChain") {
      attestationChain()
    }

    // SPEC §8.1 android-key.
    AsyncFunction("attestation") {
      mapOf("kind" to "android-key", "chain" to attestationChain())
    }

    // SHA256withECDSA over the message bytes (hex). Returns r‖s with low s, hex (SPEC §2).
    AsyncFunction("sign") { messageHex: String ->
      val entry = keyStore().getEntry(ALIAS, null) as? KeyStore.PrivateKeyEntry
        ?: throw IllegalStateException("no key")
      val s = Signature.getInstance("SHA256withECDSA")
      s.initSign(entry.privateKey)
      s.update(hexToBytes(messageHex))
      bytesToHex(Signatures.derToLowSCompact(s.sign()))
    }

    AsyncFunction("deleteKey") {
      keyStore().deleteEntry(ALIAS)
    }
  }

  private fun keyStore(): KeyStore = KeyStore.getInstance(PROVIDER).apply { load(null) }

  private fun attestationChain(): List<String> {
    val chain = keyStore().getCertificateChain(ALIAS) ?: throw IllegalStateException("no key")
    return chain.map { Base64.encodeToString(it.encoded, Base64.NO_WRAP) }
  }

  private fun spec(strongBox: Boolean): KeyGenParameterSpec {
    val b = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256)
      .setAttestationChallenge(CHALLENGE)
    if (strongBox) b.setIsStrongBoxBacked(true)
    return b.build()
  }

  /** Generates the key and returns true if it is StrongBox backed. */
  private fun generate(): Boolean {
    val kpg = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, PROVIDER)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      try {
        kpg.initialize(spec(true))
        kpg.generateKeyPair()
        return true
      } catch (e: StrongBoxUnavailableException) {
        // No StrongBox on this device: use the TEE.
      }
    }
    kpg.initialize(spec(false))
    kpg.generateKeyPair()
    return false
  }

  private fun publicKeyBytes(ks: KeyStore): ByteArray {
    val cert = ks.getCertificate(ALIAS) ?: throw IllegalStateException("no key")
    val pub = cert.publicKey as ECPublicKey
    return byteArrayOf(4) + Signatures.fixed32(pub.w.affineX) + Signatures.fixed32(pub.w.affineY)
  }

  /** strongBox: whether generation asked for StrongBox, or null if unknown (a loaded key). */
  private fun describe(strongBox: Boolean?): Map<String, String> {
    val ks = keyStore()
    return mapOf("publicKey" to bytesToHex(publicKeyBytes(ks)), "level" to level(ks, strongBox))
  }

  /** The level the keystore reports: strongbox, tee or software. A claim only: the service checks the attestation. */
  private fun level(ks: KeyStore, strongBox: Boolean?): String {
    val key = (ks.getEntry(ALIAS, null) as KeyStore.PrivateKeyEntry).privateKey
    val info = KeyFactory.getInstance(key.algorithm, PROVIDER).getKeySpec(key, KeyInfo::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return when (info.securityLevel) {
        KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
        KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "tee"
        else -> "software"
      }
    }
    @Suppress("DEPRECATION")
    return when {
      !info.isInsideSecureHardware -> "software"
      strongBox == true -> "strongbox"
      else -> "tee"
    }
  }
}

private fun bytesToHex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }

private fun hexToBytes(s: String): ByteArray {
  require(s.length % 2 == 0) { "odd hex length" }
  return ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }
}

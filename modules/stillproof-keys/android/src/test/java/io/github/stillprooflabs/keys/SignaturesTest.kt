package io.github.stillprooflabs.keys

import java.io.File
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SignaturesTest {
  private val halfN = Signatures.N.shiftRight(1)

  // Shared with src/__tests__/signatures.test.ts, which checks with @noble/curves that each
  // expected r‖s verifies over its message.
  private val vectors = File("../testdata/der-vectors.json").readText()

  private fun field(name: String) = Regex("\"$name\": \"([0-9a-f]*)\"").findAll(vectors).map { it.groupValues[1] }.toList()

  @Test
  fun matchesTheSharedVectors() {
    val ders = field("der")
    val compacts = field("compact")
    assertTrue(compacts.size >= 8)
    compacts.forEachIndexed { i, compact ->
      assertEquals("vector $i", compact, hex(Signatures.derToLowSCompact(unhex(ders[i]))))
    }
  }

  @Test
  fun rejectsTheInvalidVectors() {
    val invalid = field("der").drop(field("compact").size)
    assertEquals(8, invalid.size)
    invalid.forEach { der ->
      assertThrows(der, IllegalArgumentException::class.java) { Signatures.derToLowSCompact(unhex(der)) }
    }
  }

  @Test
  fun jcaSignaturesConvertToLowSThatStillVerify() {
    val kpg = KeyPairGenerator.getInstance("EC")
    kpg.initialize(ECGenParameterSpec("secp256r1"))
    val pair = kpg.generateKeyPair()
    repeat(200) { i ->
      val message = "stillproof/claim/v0\ncaptured $i\n".toByteArray()
      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(pair.private)
      signer.update(message)
      val compact = Signatures.derToLowSCompact(signer.sign())
      assertEquals(64, compact.size)
      val r = BigInteger(1, compact.copyOfRange(0, 32))
      val s = BigInteger(1, compact.copyOfRange(32, 64))
      assertTrue(s <= halfN)

      val verifier = Signature.getInstance("SHA256withECDSA")
      verifier.initVerify(pair.public)
      verifier.update(message)
      assertTrue(verifier.verify(der(r, s)))
    }
  }

  @Test
  fun fixed32PadsAndTrims() {
    assertArrayEquals(ByteArray(31) + byteArrayOf(1), Signatures.fixed32(BigInteger.ONE))
    assertEquals(32, Signatures.fixed32(Signatures.N).size) // BigInteger adds a sign byte here
  }

  private fun der(r: BigInteger, s: BigInteger): ByteArray {
    fun int(n: BigInteger): ByteArray = n.toByteArray().let { byteArrayOf(2, it.size.toByte()) + it }
    val body = int(r) + int(s)
    return byteArrayOf(0x30, body.size.toByte()) + body
  }

  private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

  private fun unhex(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }
}

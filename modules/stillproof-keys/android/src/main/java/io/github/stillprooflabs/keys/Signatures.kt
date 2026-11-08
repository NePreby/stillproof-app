package io.github.stillprooflabs.keys

import java.math.BigInteger

/** ECDSA P-256 signature encoding, SPEC.md §2. Plain JVM code, so unit tests run without a device. */
internal object Signatures {
  /** The order n of P-256. */
  val N = BigInteger("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551", 16)
  private val HALF_N: BigInteger = N.shiftRight(1)

  /**
   * Converts a DER ECDSA-Sig-Value, as SHA256withECDSA returns it, to r‖s
   * (32 bytes each, big-endian) with s in the lower half of the order:
   * s > n/2 becomes n − s.
   */
  fun derToLowSCompact(der: ByteArray): ByteArray {
    val p = DerReader(der)
    require(p.byte() == 0x30) { "expected a SEQUENCE" }
    val length = p.length()
    require(p.pos + length == der.size) { "bad SEQUENCE length" }
    val r = p.integer()
    var s = p.integer()
    require(p.pos == der.size) { "trailing bytes" }
    require(r.signum() > 0 && r < N) { "r out of range" }
    require(s.signum() > 0 && s < N) { "s out of range" }
    if (s > HALF_N) s = N.subtract(s)
    return fixed32(r) + fixed32(s)
  }

  /** The unsigned big-endian value in exactly 32 bytes. */
  fun fixed32(n: BigInteger): ByteArray {
    require(n.signum() >= 0 && n.bitLength() <= 256) { "out of range" }
    val b = n.toByteArray()
    return when {
      b.size == 32 -> b
      b.size > 32 -> b.copyOfRange(b.size - 32, b.size)
      else -> ByteArray(32 - b.size) + b
    }
  }

  private class DerReader(private val b: ByteArray) {
    var pos = 0

    fun byte(): Int {
      require(pos < b.size) { "truncated" }
      return b[pos++].toInt() and 0xff
    }

    fun length(): Int {
      val first = byte()
      if (first < 0x80) return first
      require(first == 0x81) { "unsupported length" }
      val l = byte()
      require(l >= 0x80) { "non-minimal length" }
      return l
    }

    fun integer(): BigInteger {
      require(byte() == 0x02) { "expected an INTEGER" }
      val len = length()
      require(len in 1..33 && pos + len <= b.size) { "bad INTEGER length" }
      val v = b.copyOfRange(pos, pos + len)
      pos += len
      require(v[0] >= 0) { "negative INTEGER" }
      require(len == 1 || v[0] != 0.toByte() || v[1] < 0) { "non-minimal INTEGER" }
      return BigInteger(1, v)
    }
  }
}

// The DER → r‖s low-s vectors that the Kotlin conversion must reproduce
// (modules/stillproof-keys/android/src/test). Here each expected output is
// checked against @noble/curves.
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import vectors from '../../modules/stillproof-keys/testdata/der-vectors.json';

const N = p256.Point.CURVE().n;
const HALF_N = N >> 1n;
const key = hexToBytes(vectors.public_key);
const opts = { prehash: false, lowS: true, format: 'compact' } as const;

it('covers high s, short r and s, and 33-byte r', () => {
  const cases = vectors.valid.flatMap((v) => v.cases.split(' '));
  for (const c of ['lowS', 'highS', 'shortR', 'longR', 'shortS']) expect(cases).toContain(c);
});

describe.each(vectors.valid.map((v, i) => [i, v] as const))('vector %i', (_, v) => {
  const der = p256.Signature.fromBytes(hexToBytes(v.der), 'der');
  const out = hexToBytes(v.compact);
  const hash = sha256(hexToBytes(v.message));

  it('is r‖s of the DER signature with s normalised', () => {
    expect(out).toHaveLength(64);
    const got = p256.Signature.fromBytes(out, 'compact');
    expect(got.r).toBe(der.r);
    expect(got.s).toBe(der.s > HALF_N ? N - der.s : der.s);
    expect(got.s <= HALF_N).toBe(true);
    expect(v.cases.includes('highS')).toBe(der.s > HALF_N);
  });

  it('verifies with noble, which rejects high s', () => {
    expect(p256.verify(out, hash, key, opts)).toBe(true);
    if (der.s > HALF_N) expect(p256.verify(der.toBytes('compact'), hash, key, opts)).toBe(false);
  });

  it('round-trips through DER', () => {
    expect(bytesToHex(der.toBytes('der'))).toBe(v.der);
  });
});

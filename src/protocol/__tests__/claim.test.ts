import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

import {
  buildClaim,
  claimId,
  claimText,
  parseSignedClaim,
  signClaim,
  signedText,
  softwareSigner,
  verifyClaim,
} from '../claim';
import vectors from '../__fixtures__/vectors.json';

const HALF_N = p256.Point.CURVE().n >> 1n;
const privateKey = hexToBytes(vectors.private_key);

describe('valid vectors', () => {
  it.each(vectors.claims.map((v, i) => [i, v] as const))('vector %i', async (_, v) => {
    const s = parseSignedClaim(v.signed);
    expect(verifyClaim(s)).toBe(true);
    expect(signedText(s)).toBe(v.signed);
    expect(claimId(s)).toBe(v.id);
    expect(s.sha256).toBe(v.sha256);
    expect(s.key).toBe(vectors.public_key);

    const c = buildClaim(hexToBytes(v.file_hex), v.type, BigInt(v.captured), vectors.public_key);
    expect(claimText(c)).toBe(v.claim);

    const fresh = await signClaim(c, softwareSigner(privateKey));
    expect(verifyClaim(fresh)).toBe(true);
    expect(BigInt('0x' + fresh.sig.slice(64))).toBeLessThanOrEqual(HALF_N);
    expect(parseSignedClaim(signedText(fresh))).toEqual(fresh);
  });
});

it('the vector private key matches the public key', () => {
  expect(bytesToHex(p256.getPublicKey(privateKey, false))).toBe(vectors.public_key);
});

it('signs SHA-256(claim), matching noble v2 default prehashing', () => {
  const message = new TextEncoder().encode(vectors.claims[1].claim);
  const ours = softwareSigner(privateKey)(message);
  expect(ours).toEqual(p256.sign(message, privateKey));
  expect(p256.verify(ours as Uint8Array, message, hexToBytes(vectors.public_key))).toBe(true);
});

it('signClaim normalises a high-s signer to low s', async () => {
  const c = buildClaim(new Uint8Array([1, 2, 3]), 'image/jpeg', 1n, vectors.public_key);
  const highS = (message: Uint8Array) => {
    const sig = p256.Signature.fromBytes(softwareSigner(privateKey)(message) as Uint8Array, 'compact');
    return new p256.Signature(sig.r, p256.Point.CURVE().n - sig.s).toBytes('compact');
  };
  const s = await signClaim(c, highS);
  expect(BigInt('0x' + s.sig.slice(64))).toBeLessThanOrEqual(HALF_N);
  expect(verifyClaim(s)).toBe(true);
});

describe('invalid vectors are rejected', () => {
  it.each(vectors.invalid.map((v) => [v.why, v.signed] as const))('%s', (_, signed) => {
    let ok = false;
    try {
      ok = verifyClaim(parseSignedClaim(signed));
    } catch {
      ok = false;
    }
    expect(ok).toBe(false);
  });

  it('rejects a high s at verification, not parsing', () => {
    const v = vectors.invalid.find((x) => x.why === 'high s')!;
    expect(verifyClaim(parseSignedClaim(v.signed))).toBe(false);
  });

  it.each([
    ['uppercase hex', 'uppercase hex'],
    ['missing final newline', 'missing final newline'],
    ['carriage returns', 'carriage returns'],
    ['wrong header', 'wrong header'],
    ['leading zero', 'leading zero in captured'],
  ])('parse rejects %s', (_, why) => {
    const v = vectors.invalid.find((x) => x.why === why)!;
    expect(() => parseSignedClaim(v.signed)).toThrow();
  });
});

describe('parse is strict', () => {
  const good = vectors.claims[1].signed;
  it.each([
    ['plus sign in captured', good.replace('captured 1762300800000', 'captured +1762300800000')],
    ['negative captured', good.replace('captured 1762300800000', 'captured -1')],
    ['captured above int64', good.replace('captured 1762300800000', 'captured 9223372036854775808')],
    ['uppercase type', good.replace('type image/png', 'type Image/png')],
    ['extra line', good + 'extra\n'],
    ['double space', good.replace('type image/png', 'type  image/png')],
    ['compressed key', good.replace(/key 04[0-9a-f]{128}/, 'key 02' + '0'.repeat(64))],
    ['off-curve key', good.replace(/key 04[0-9a-f]{128}/, 'key 04' + '1'.repeat(128))],
    ['short sig', good.replace(/sig [0-9a-f]{128}/, 'sig ' + 'a'.repeat(126))],
  ])('%s', (_, text) => {
    expect(() => parseSignedClaim(text)).toThrow();
  });

  it('accepts the int64 maximum', () => {
    const text = good.replace('captured 1762300800000', 'captured 9223372036854775807');
    expect(parseSignedClaim(text).captured).toBe(2n ** 63n - 1n);
  });
});

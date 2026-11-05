// Stillproof claims, SPEC.md §1–3.
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const HEADER = 'stillproof/claim/v0';

export type Claim = {
  /** SHA-256 of the file, 64 lowercase hex characters. */
  sha256: string;
  /** Lowercase media type, such as image/jpeg. */
  type: string;
  /** Device-claimed capture time, unix milliseconds. Bigint so the full int64 range round-trips. */
  captured: bigint;
  /** SEC1 uncompressed P-256 public key, 130 lowercase hex characters. */
  key: string;
};

export type SignedClaim = Claim & {
  /** r‖s, low s, 128 lowercase hex characters. */
  sig: string;
};

export class ClaimFormatError extends Error {
  name = 'ClaimFormatError';
}

const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const INT64_MAX = 2n ** 63n - 1n;
const HALF_N = p256.Point.CURVE().n >> 1n;

const lowerHex = (len: number) => new RegExp(`^[0-9a-f]{${len}}$`);
const HEX64 = lowerHex(64);
const HEX128 = lowerHex(128);
const HEX130 = lowerHex(130);

function check(c: Claim): void {
  if (!HEX64.test(c.sha256)) throw new ClaimFormatError('sha256 must be 64 lowercase hex characters');
  if (!MEDIA_TYPE.test(c.type)) throw new ClaimFormatError(`bad media type ${JSON.stringify(c.type)}`);
  if (c.captured < 0n || c.captured > INT64_MAX) throw new ClaimFormatError('captured out of range');
  if (!HEX130.test(c.key) || !c.key.startsWith('04')) {
    throw new ClaimFormatError('key must be an uncompressed P-256 key in lowercase hex');
  }
  try {
    p256.Point.fromHex(c.key).assertValidity();
  } catch {
    throw new ClaimFormatError('key is not a point on P-256');
  }
}

/** The exact claim text the device signs. */
export function claimText(c: Claim): string {
  return `${HEADER}\nsha256 ${c.sha256}\ntype ${c.type}\ncaptured ${c.captured}\nkey ${c.key}\n`;
}

/** The signed claim: the claim plus its sig line. */
export function signedText(s: SignedClaim): string {
  return `${claimText(s)}sig ${s.sig}\n`;
}

/** SHA-256 of the claim text: what the signature covers. */
export function claimDigest(c: Claim): Uint8Array {
  return sha256(utf8ToBytes(claimText(c)));
}

/** SHA-256(0x00 ‖ signed claim). */
export function leafHash(signed: string): Uint8Array {
  return sha256(concatBytes(new Uint8Array([0]), utf8ToBytes(signed)));
}

/** The claim id: hex leaf hash. */
export function claimId(s: SignedClaim): string {
  return bytesToHex(leafHash(signedText(s)));
}

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

export function buildClaim(fileBytes: Uint8Array, type: string, captured: bigint, key: string): Claim {
  const c = { sha256: sha256Hex(fileBytes), type, captured, key };
  check(c);
  return c;
}

/**
 * Signs message bytes with ECDSA P-256 over SHA-256(message) and returns r‖s.
 * The signer hashes, as hardware keystores do; s may be high.
 */
export type Signer = (message: Uint8Array) => Promise<Uint8Array> | Uint8Array;

/** Signs c, normalising s to the lower half of the curve order. */
export async function signClaim(c: Claim, sign: Signer): Promise<SignedClaim> {
  check(c);
  const sig = await sign(utf8ToBytes(claimText(c)));
  if (sig.length !== 64) throw new Error('signature must be 64 bytes r‖s');
  const { r, s } = p256.Signature.fromBytes(sig, 'compact');
  const n = p256.Point.CURVE().n;
  return { ...c, sig: bytesToHex(new p256.Signature(r, s > HALF_N ? n - s : s).toBytes('compact')) };
}

/** A Signer for a raw private key, used by the software key store and tests. */
export function softwareSigner(privateKey: Uint8Array): Signer {
  // Hash explicitly rather than rely on noble's prehash default, which differs between v1 and v2.
  return (message) => p256.sign(sha256(message), privateKey, { prehash: false, lowS: true, format: 'compact' });
}

/** True if the signature is a valid low-s signature by key over SHA-256(claim). */
export function verifyClaim(s: SignedClaim): boolean {
  try {
    check(s);
  } catch {
    return false;
  }
  if (!HEX128.test(s.sig)) return false;
  const sig = hexToBytes(s.sig);
  return p256.verify(sig, claimDigest(s), hexToBytes(s.key), {
    prehash: false,
    lowS: true,
    format: 'compact',
  });
}

/**
 * Parses a signed claim and requires it to be byte-for-byte canonical.
 * It does not verify the signature.
 */
export function parseSignedClaim(text: string): SignedClaim {
  const lines = text.split('\n');
  if (lines.length !== 7 || lines[6] !== '' || lines[0] !== HEADER) {
    throw new ClaimFormatError('not a v0 signed claim');
  }
  const field = (i: number, name: string): string => {
    const prefix = `${name} `;
    if (!lines[i].startsWith(prefix)) throw new ClaimFormatError(`line ${i + 1} is not ${name}`);
    return lines[i].slice(prefix.length);
  };
  const captured = field(3, 'captured');
  if (!DECIMAL.test(captured)) throw new ClaimFormatError('captured must be decimal without leading zeros');
  const s: SignedClaim = {
    sha256: field(1, 'sha256'),
    type: field(2, 'type'),
    captured: BigInt(captured),
    key: field(4, 'key'),
    sig: field(5, 'sig'),
  };
  check(s);
  if (!HEX128.test(s.sig)) throw new ClaimFormatError('sig must be 128 lowercase hex characters');
  if (signedText(s) !== text) throw new ClaimFormatError('not canonical');
  return s;
}

// RFC 6962 Merkle tree inclusion proofs, verified as in RFC 9162 §2.1.3.2 (SPEC.md §3).
import { sha256 } from '@noble/hashes/sha2.js';
import { equalBytes } from '@noble/curves/utils.js';
import { concatBytes } from '@noble/hashes/utils.js';

function node(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256(concatBytes(new Uint8Array([1]), left, right));
}

/** True if leaf (a leaf hash) is at index in a tree of size leaves with root. */
export function verifyInclusion(
  leaf: Uint8Array,
  index: number,
  size: number,
  proof: Uint8Array[],
  root: Uint8Array,
): boolean {
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(size) || index < 0 || index >= size) {
    return false;
  }
  // fn and sn exceed 32 bits for large trees, so use bigint rather than bitwise ops on numbers.
  let fn = BigInt(index);
  let sn = BigInt(size - 1);
  let r = leaf;
  for (const p of proof) {
    if (p.length !== 32 || sn === 0n) return false;
    if ((fn & 1n) === 1n || fn === sn) {
      r = node(p, r);
      while ((fn & 1n) === 0n && fn !== 0n) {
        fn >>= 1n;
        sn >>= 1n;
      }
    } else {
      r = node(r, p);
    }
    fn >>= 1n;
    sn >>= 1n;
  }
  return sn === 0n && equalBytes(r, root);
}

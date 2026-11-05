import { hexToBytes } from '@noble/hashes/utils.js';

import { verifyInclusion } from '../merkle';
import vectors from '../__fixtures__/vectors.json';

const leaves = vectors.claims.map((c) => hexToBytes(c.id));
const root = hexToBytes(vectors.tree.root);
const size = leaves.length;
const proofs = vectors.tree.proofs.map((p) => p.map((h) => hexToBytes(h)));

describe.each(leaves.map((leaf, i) => [i, leaf] as const))('leaf %i', (i, leaf) => {
  const proof = proofs[i];

  it('verifies against the root', () => {
    expect(verifyInclusion(leaf, i, size, proof, root)).toBe(true);
  });

  it('fails when tampered', () => {
    const flip = (b: Uint8Array) => {
      const c = b.slice();
      c[0] ^= 1;
      return c;
    };
    expect(verifyInclusion(flip(leaf), i, size, proof, root)).toBe(false);
    expect(verifyInclusion(leaf, i, size, proof, flip(root))).toBe(false);
    expect(verifyInclusion(leaf, i, size, [flip(proof[0]), ...proof.slice(1)], root)).toBe(false);
    expect(verifyInclusion(leaf, (i + 1) % size, size, proof, root)).toBe(false);
    // Not size + 1: a proof for leaves 0–1 of a 3-leaf tree is also a valid
    // proof for a 4-leaf tree with the same left subtree.
    expect(verifyInclusion(leaf, i, size + 2, proof, root)).toBe(false);
    expect(verifyInclusion(leaf, i, size, proof.slice(0, -1), root)).toBe(false);
    expect(verifyInclusion(leaf, i, size, [...proof, proof[0]], root)).toBe(false);
  });
});

it('rejects an index outside the tree', () => {
  expect(verifyInclusion(leaves[0], -1, size, proofs[0], root)).toBe(false);
  expect(verifyInclusion(leaves[0], size, size, proofs[0], root)).toBe(false);
});

it('a single-leaf tree has an empty proof and the leaf as root', () => {
  expect(verifyInclusion(leaves[0], 0, 1, [], leaves[0])).toBe(true);
  expect(verifyInclusion(leaves[0], 0, 1, [], leaves[1])).toBe(false);
});

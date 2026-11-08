import { hexToBytes } from '@noble/hashes/utils.js';

import { parseReceipt, verdictLines, verifyReceipt, type FetchTx, type Receipt } from '../receipt';
import vectors from '../__fixtures__/vectors.json';

const ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';
const TX = 'a'.repeat(64);
const CLOSED_AT = '2026-11-05T12:00:00Z';
const ANDROID = { kind: 'android-key', chain: ['MIIB', 'MIIC'] } as const;
const APPLE = { kind: 'apple-app-attest', key_id: 'AAAA', object: 'o2Nm' } as const;

const v0: Receipt = {
  v: 0,
  claim: vectors.claims[1].signed,
  index: 1,
  size: vectors.claims.length,
  proof: vectors.tree.proofs[1],
  root: vectors.tree.root,
  anchor: { network: 'testnet', account: ACCOUNT, tx: TX, ledger: 123, closed_at: CLOSED_AT },
};
const v1 = (extra: object, anchor: object = {}) => ({ ...v0, v: 1, ...extra, anchor: { ...v0.anchor, ...anchor } });

const fetchTx: FetchTx = async () => ({
  successful: true,
  source_account: ACCOUNT,
  memo_type: 'hash',
  memo: btoa(String.fromCharCode(...hexToBytes(vectors.tree.root))),
  ledger: 123,
  created_at: CLOSED_AT,
});
const file = hexToBytes(vectors.claims[1].file_hex);

describe('parseReceipt v1', () => {
  it.each([
    ['plain v1', v1({})],
    ['android attestation', v1({ attestation: ANDROID })],
    ['apple attestation', v1({ attestation: APPLE })],
    ['validator proof', v1({}, { proof: { version: 1, ledger: 123 } })],
  ])('accepts %s', (_, r) => {
    expect(parseReceipt(JSON.stringify(r))).toEqual(r);
  });

  it.each([
    ['version 2', { ...v0, v: 2 }],
    ['an unknown field', { ...v0, extra: true }],
    ['an unknown anchor field', v1({}, { memo: 'x' })],
    ['attestation on v0', { ...v0, attestation: ANDROID }],
    ['anchor proof on v0', { ...v0, anchor: { ...v0.anchor, proof: {} } }],
    ['an unknown attestation kind', v1({ attestation: { kind: 'tpm', chain: ['AAAA'] } })],
    ['an empty chain', v1({ attestation: { kind: 'android-key', chain: [] } })],
    ['a chain that is not base64', v1({ attestation: { kind: 'android-key', chain: ['not base64!'] } })],
    ['mixed attestation fields', v1({ attestation: { ...APPLE, chain: ['AAAA'] } })],
    ['a non-object proof', v1({}, { proof: 'bundle' })],
  ])('rejects %s', (_, r) => {
    expect(() => parseReceipt(JSON.stringify(r))).toThrow();
  });
});

describe('verifying v1', () => {
  it('reports a plain v1 receipt like v0', async () => {
    const v = await verifyReceipt(file, parseReceipt(JSON.stringify(v1({}))), fetchTx);
    expect(v).toMatchObject({ ok: true, keyLevel: 'software' });
    expect(v).not.toHaveProperty('claimedAttestation');
  });

  it('shows an attested level as claimed, never as checked', async () => {
    const v = await verifyReceipt(file, parseReceipt(JSON.stringify(v1({ attestation: ANDROID }))), fetchTx);
    expect(v).toMatchObject({ ok: true, keyLevel: 'unchecked', claimedAttestation: 'android-key' });
    expect(verdictLines(v).filter((l) => l.startsWith('Key level'))).toEqual([
      'Key level: tee or strongbox, as claimed by its android-key attestation. Not checked by this app.',
    ]);
  });

  it('keeps the claimed level on failure', async () => {
    const v = await verifyReceipt(new Uint8Array(), parseReceipt(JSON.stringify(v1({ attestation: APPLE }))), fetchTx);
    expect(v).toMatchObject({ ok: false, failedStep: 'file', keyLevel: 'unchecked', claimedAttestation: 'apple-app-attest' });
  });

  it('flags a validator proof it did not check', async () => {
    const v = await verifyReceipt(file, parseReceipt(JSON.stringify(v1({}, { proof: {} }))), fetchTx);
    expect(v).toMatchObject({ ok: true, hasValidatorProof: true });
  });
});

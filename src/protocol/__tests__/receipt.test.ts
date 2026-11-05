import { hexToBytes } from '@noble/hashes/utils.js';

import { horizonFetchTx, parseReceipt, verdictLines, verifyReceipt, type FetchTx, type HorizonTx, type Receipt } from '../receipt';
import vectors from '../__fixtures__/vectors.json';

const ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7';
const OTHER_ACCOUNT = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const TX = 'a'.repeat(64);
const CLOSED_AT = '2026-11-05T12:00:00Z';

const toBase64 = (hex: string) => btoa(String.fromCharCode(...hexToBytes(hex)));

function receiptFor(i: number): Receipt {
  return {
    v: 0,
    claim: vectors.claims[i].signed,
    index: i,
    size: vectors.claims.length,
    proof: vectors.tree.proofs[i],
    root: vectors.tree.root,
    anchor: { network: 'testnet', account: ACCOUNT, tx: TX, ledger: 123, closed_at: CLOSED_AT },
  };
}

const goodTx: HorizonTx = {
  successful: true,
  source_account: ACCOUNT,
  memo_type: 'hash',
  memo: toBase64(vectors.tree.root),
  ledger: 123,
  created_at: CLOSED_AT,
};

const fakeFetch =
  (tx: HorizonTx | null): FetchTx =>
  async (network, hash) =>
    network === 'testnet' && hash === TX ? tx : null;

const file = (i: number) => hexToBytes(vectors.claims[i].file_hex);

describe.each(vectors.claims.map((_, i) => i))('receipt for vector %i', (i) => {
  it('verifies', async () => {
    const v = await verifyReceipt(file(i), receiptFor(i), fakeFetch(goodTx));
    expect(v).toEqual({
      ok: true,
      key: vectors.public_key,
      existedNoLaterThan: CLOSED_AT,
      ledger: 123,
      deviceCaptured: BigInt(vectors.claims[i].captured),
      keyLevel: 'software',
      caveat: expect.stringContaining('does not prove the scene is genuine'),
    });
  });

  it('round-trips through JSON', () => {
    expect(parseReceipt(JSON.stringify(receiptFor(i)))).toEqual(receiptFor(i));
  });
});

const failures: [string, () => Promise<unknown>, string][] = [
  ['malformed claim', () => verifyReceipt(file(1), { ...receiptFor(1), claim: vectors.invalid[1].signed }, fakeFetch(goodTx)), 'claim'],
  ['wrong file', () => verifyReceipt(file(2), receiptFor(1), fakeFetch(goodTx)), 'file'],
  ['high s', () => verifyReceipt(file(1), { ...receiptFor(1), claim: vectors.invalid[0].signed }, fakeFetch(goodTx)), 'signature'],
  ['wrong root', () => verifyReceipt(file(1), { ...receiptFor(1), root: vectors.claims[0].id }, fakeFetch(goodTx)), 'tree'],
  ['wrong index', () => verifyReceipt(file(1), { ...receiptFor(1), index: 0 }, fakeFetch(goodTx)), 'tree'],
  ['wrong memo', () => verifyReceipt(file(1), receiptFor(1), fakeFetch({ ...goodTx, memo: toBase64(vectors.claims[0].id) })), 'anchor'],
  ['text memo', () => verifyReceipt(file(1), receiptFor(1), fakeFetch({ ...goodTx, memo_type: 'text', memo: 'hi' })), 'anchor'],
  ['wrong source account', () => verifyReceipt(file(1), receiptFor(1), fakeFetch({ ...goodTx, source_account: OTHER_ACCOUNT })), 'anchor'],
  ['unsuccessful tx', () => verifyReceipt(file(1), receiptFor(1), fakeFetch({ ...goodTx, successful: false })), 'anchor'],
  ['missing tx', () => verifyReceipt(file(1), receiptFor(1), fakeFetch(null)), 'anchor'],
  ['ledger differs', () => verifyReceipt(file(1), receiptFor(1), fakeFetch({ ...goodTx, ledger: 124 })), 'anchor'],
  ['close time differs', () => verifyReceipt(file(1), receiptFor(1), fakeFetch({ ...goodTx, created_at: '2026-11-05T12:00:05Z' })), 'anchor'],
  ['Horizon unreachable', () => verifyReceipt(file(1), receiptFor(1), () => Promise.reject(new Error('offline'))), 'anchor'],
];

it.each(failures)('fails on %s', async (_, run, step) => {
  const v = await run();
  expect(v).toMatchObject({ ok: false, failedStep: step, keyLevel: 'software' });
});

it('names the step number and keeps the caveat on failure', async () => {
  const v = await verifyReceipt(file(2), receiptFor(1), fakeFetch(goodTx));
  expect(v).toMatchObject({ ok: false, stepNumber: 2 });
  expect(verdictLines(v).join('\n')).toMatch(/step 2 \(file\)[\s\S]*software[\s\S]*not prove the scene is genuine/);
});

it('verdict lines report every item of step 6', async () => {
  const v = await verifyReceipt(file(1), receiptFor(1), fakeFetch(goodTx));
  expect(verdictLines(v)).toEqual([
    `Unchanged since signed by key ${vectors.public_key}.`,
    `Existed no later than ${CLOSED_AT} (ledger 123).`,
    'Device-claimed capture time: 2025-11-05T00:00:00.000Z (the device clock is a claim, not evidence).',
    'Key level: software',
    expect.stringContaining('does not prove the scene is genuine'),
  ]);
});

describe('parseReceipt rejects', () => {
  const good = receiptFor(0);
  it.each([
    ['not JSON', '{'],
    ['wrong version', JSON.stringify({ ...good, v: 1 })],
    ['uppercase root', JSON.stringify({ ...good, root: good.root.toUpperCase() })],
    ['bad proof', JSON.stringify({ ...good, proof: ['zz'] })],
    ['negative index', JSON.stringify({ ...good, index: -1 })],
    ['unknown network', JSON.stringify({ ...good, anchor: { ...good.anchor, network: 'futurenet' } })],
    ['bad account', JSON.stringify({ ...good, anchor: { ...good.anchor, account: 'nope' } })],
    ['bad close time', JSON.stringify({ ...good, anchor: { ...good.anchor, closed_at: 'later' } })],
  ])('%s', (_, json) => {
    expect(() => parseReceipt(json)).toThrow();
  });
});

describe('horizonFetchTx', () => {
  const respond = (status: number, body: unknown = {}) =>
    jest.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('reads the testnet transaction', async () => {
    const f = respond(200, goodTx);
    await expect(horizonFetchTx(f)('testnet', TX)).resolves.toEqual(goodTx);
    expect(f).toHaveBeenCalledWith(`https://horizon-testnet.stellar.org/transactions/${TX}`);
  });

  it('uses the mainnet Horizon for mainnet', async () => {
    const f = respond(200, goodTx);
    await horizonFetchTx(f)('mainnet', TX);
    expect(f).toHaveBeenCalledWith(`https://horizon.stellar.org/transactions/${TX}`);
  });

  it('maps 404 to null and other errors to a throw', async () => {
    await expect(horizonFetchTx(respond(404))('testnet', TX)).resolves.toBeNull();
    await expect(horizonFetchTx(respond(500))('testnet', TX)).rejects.toThrow('500');
  });
});

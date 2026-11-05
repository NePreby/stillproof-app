// Receipts and verification, SPEC.md §5–6.
import { equalBytes } from '@noble/curves/utils.js';
import { hexToBytes } from '@noble/hashes/utils.js';

import { ClaimFormatError, leafHash, parseSignedClaim, sha256Hex, verifyClaim, type SignedClaim } from './claim';
import { verifyInclusion } from './merkle';

export type Network = 'testnet' | 'mainnet';

export const HORIZON: Record<Network, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

export type Receipt = {
  v: 0;
  claim: string;
  index: number;
  size: number;
  proof: string[];
  root: string;
  anchor: {
    network: Network;
    account: string;
    tx: string;
    ledger: number;
    closed_at: string;
  };
};

/** The fields of Horizon's GET /transactions/{hash} that verification reads. */
export type HorizonTx = {
  successful: boolean;
  source_account: string;
  memo_type: string;
  /** Base64 for memo_type "hash". */
  memo?: string;
  ledger: number;
  created_at: string;
};

/** Returns the transaction, or null if Horizon does not know it. Throws on network errors. */
export type FetchTx = (network: Network, hash: string) => Promise<HorizonTx | null>;

export const STEPS = ['claim', 'file', 'signature', 'tree', 'anchor'] as const;
export type Step = (typeof STEPS)[number];

export const KEY_LEVEL = 'software';
export const CAVEAT = 'This does not prove the scene is genuine. A photo of a screen verifies too.';

export type Verdict =
  | {
      ok: true;
      key: string;
      /** Ledger close time: the file existed no later than this. */
      existedNoLaterThan: string;
      ledger: number;
      /** Device clock at capture, unix ms. A claim, not evidence. */
      deviceCaptured: bigint;
      keyLevel: typeof KEY_LEVEL;
      caveat: typeof CAVEAT;
    }
  | {
      ok: false;
      failedStep: Step;
      /** 1-based step number in SPEC.md §6. */
      stepNumber: number;
      reason: string;
      keyLevel: typeof KEY_LEVEL;
      caveat: typeof CAVEAT;
    };

export class ReceiptFormatError extends Error {
  name = 'ReceiptFormatError';
}

const HEX64 = /^[0-9a-f]{64}$/;
const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isCount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0;

/** Parses receipt JSON and checks its shape. It does not verify anything. */
export function parseReceipt(json: string): Receipt {
  let r: unknown;
  try {
    r = JSON.parse(json);
  } catch {
    throw new ReceiptFormatError('receipt is not JSON');
  }
  const fail = (what: string): never => {
    throw new ReceiptFormatError(`receipt: bad ${what}`);
  };
  if (!isObject(r)) return fail('receipt');
  if (r.v !== 0) fail('version');
  if (typeof r.claim !== 'string') fail('claim');
  if (!isCount(r.index)) fail('index');
  if (!isCount(r.size)) fail('size');
  if (!Array.isArray(r.proof) || !r.proof.every((p) => typeof p === 'string' && HEX64.test(p))) fail('proof');
  if (typeof r.root !== 'string' || !HEX64.test(r.root)) fail('root');
  const a = r.anchor;
  if (!isObject(a)) return fail('anchor');
  if (a.network !== 'testnet' && a.network !== 'mainnet') fail('anchor.network');
  if (typeof a.account !== 'string' || !STELLAR_ACCOUNT.test(a.account)) fail('anchor.account');
  if (typeof a.tx !== 'string' || !HEX64.test(a.tx)) fail('anchor.tx');
  if (!isCount(a.ledger)) fail('anchor.ledger');
  if (typeof a.closed_at !== 'string' || Number.isNaN(Date.parse(a.closed_at))) fail('anchor.closed_at');
  return r as Receipt;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

class StepFailure extends Error {
  constructor(
    readonly step: Step,
    message: string,
  ) {
    super(message);
  }
}

async function checkAnchor(receipt: Receipt, fetchTx: FetchTx): Promise<void> {
  const { anchor } = receipt;
  const fail = (why: string): never => {
    throw new StepFailure('anchor', why);
  };
  let tx: HorizonTx | null;
  try {
    tx = await fetchTx(anchor.network, anchor.tx);
  } catch (e) {
    return fail(`could not read the transaction from Horizon: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!tx) fail(`transaction ${anchor.tx} not found on ${anchor.network}`);
  if (tx!.successful !== true) fail('the anchor transaction was not successful');
  if (tx!.source_account !== anchor.account) fail(`transaction source is ${tx!.source_account}, not ${anchor.account}`);
  if (tx!.memo_type !== 'hash' || typeof tx!.memo !== 'string') fail('transaction memo is not a hash memo');
  let memo: Uint8Array;
  try {
    memo = base64ToBytes(tx!.memo!);
  } catch {
    return fail('transaction memo is not valid base64');
  }
  if (!equalBytes(memo, hexToBytes(receipt.root))) fail('transaction memo hash is not the receipt root');
  if (tx!.ledger !== anchor.ledger) fail(`network says ledger ${tx!.ledger}, receipt says ${anchor.ledger}`);
  if (Date.parse(tx!.created_at) !== Date.parse(anchor.closed_at)) {
    fail(`network says closed at ${tx!.created_at}, receipt says ${anchor.closed_at}`);
  }
}

/** Verifies a file against its receipt, SPEC.md §6 steps 1–5, and reports the verdict (step 6). */
export async function verifyReceipt(fileBytes: Uint8Array, receipt: Receipt, fetchTx: FetchTx): Promise<Verdict> {
  const base = { keyLevel: KEY_LEVEL, caveat: CAVEAT } as const;
  try {
    let claim: SignedClaim;
    try {
      claim = parseSignedClaim(receipt.claim);
    } catch (e) {
      throw new StepFailure('claim', e instanceof ClaimFormatError ? e.message : 'claim does not parse');
    }
    if (sha256Hex(fileBytes) !== claim.sha256) throw new StepFailure('file', 'the file is not the one that was signed');
    if (!verifyClaim(claim)) throw new StepFailure('signature', 'the signature is not a valid low-s signature by key');
    let inTree = false;
    try {
      inTree = verifyInclusion(
        leafHash(receipt.claim),
        receipt.index,
        receipt.size,
        receipt.proof.map((p) => hexToBytes(p)),
        hexToBytes(receipt.root),
      );
    } catch {
      // Malformed hex in proof or root: the proof cannot recompute the root.
    }
    if (!inTree) throw new StepFailure('tree', 'the inclusion proof does not recompute the root');
    await checkAnchor(receipt, fetchTx);
    return {
      ok: true,
      key: claim.key,
      existedNoLaterThan: receipt.anchor.closed_at,
      ledger: receipt.anchor.ledger,
      deviceCaptured: claim.captured,
      ...base,
    };
  } catch (e) {
    if (!(e instanceof StepFailure)) throw e;
    return { ok: false, failedStep: e.step, stepNumber: STEPS.indexOf(e.step) + 1, reason: e.message, ...base };
  }
}

/** A FetchTx backed by Horizon's REST API. */
export function horizonFetchTx(fetchFn: typeof fetch = fetch): FetchTx {
  return async (network, hash) => {
    const res = await fetchFn(`${HORIZON[network]}/transactions/${hash}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Horizon returned ${res.status}`);
    return (await res.json()) as HorizonTx;
  };
}

/** ISO time for a captured value, or the raw milliseconds if it is outside the Date range. */
export function formatCaptured(ms: bigint): string {
  const d = new Date(Number(ms));
  return Number.isNaN(d.getTime()) ? `${ms} ms since the Unix epoch` : d.toISOString();
}

/** Human-readable lines for a verdict, as SPEC.md §6 step 6 requires. */
export function verdictLines(v: Verdict): string[] {
  if (!v.ok) {
    return [`Failed at step ${v.stepNumber} (${v.failedStep}): ${v.reason}`, `Key level: ${v.keyLevel}`, v.caveat];
  }
  return [
    `Unchanged since signed by key ${v.key}.`,
    `Existed no later than ${v.existedNoLaterThan} (ledger ${v.ledger}).`,
    `Device-claimed capture time: ${formatCaptured(v.deviceCaptured)} (the device clock is a claim, not evidence).`,
    `Key level: ${v.keyLevel}`,
    v.caveat,
  ];
}

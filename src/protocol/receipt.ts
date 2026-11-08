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

/** SPEC.md §8.1. The app reads it but does not verify the chain. */
export type Attestation =
  | { kind: 'android-key'; chain: string[] }
  | { kind: 'apple-app-attest'; key_id: string; object: string };

export type Receipt = {
  v: 0 | 1;
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
    /** v1, §8.2: an Externalize bundle. The app does not check it. */
    proof?: unknown;
  };
  /** v1, §8.1. */
  attestation?: Attestation;
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
/**
 * The key level of a receipt that carries an attestation. The app does not
 * verify attestation chains, so it never reports a hardware level as checked.
 */
export const UNCHECKED_LEVEL = 'unchecked';
export type KeyLevel = typeof KEY_LEVEL | typeof UNCHECKED_LEVEL;
/** How the app checks step 5. Validator proofs are checked by the web verifier. */
export const ANCHOR_CHECK = 'horizon';
export const CAVEAT = 'This proves the file is unchanged and when it existed. It does not prove the scene is genuine.';

export type Verdict =
  | {
      ok: true;
      key: string;
      /** Ledger close time: the file existed no later than this. */
      existedNoLaterThan: string;
      ledger: number;
      /** Device clock at capture, unix ms. A claim, not evidence. */
      deviceCaptured: bigint;
      keyLevel: KeyLevel;
      /** The attestation kind the receipt claims, if any. Not verified. */
      claimedAttestation?: Attestation['kind'];
      /** True if the receipt carries a validator proof, which the app does not check. */
      hasValidatorProof?: true;
      caveat: typeof CAVEAT;
    }
  | {
      ok: false;
      failedStep: Step;
      /** 1-based step number in SPEC.md §6. */
      stepNumber: number;
      reason: string;
      keyLevel: KeyLevel;
      /** The attestation kind the receipt claims, if any. Not verified. */
      claimedAttestation?: Attestation['kind'];
      /** True if the receipt carries a validator proof, which the app does not check. */
      hasValidatorProof?: true;
      caveat: typeof CAVEAT;
    };

export class ReceiptFormatError extends Error {
  name = 'ReceiptFormatError';
}

const HEX64 = /^[0-9a-f]{64}$/;
const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const isB64 = (x: unknown): x is string => typeof x === 'string' && x.length % 4 === 0 && BASE64.test(x);
const RECEIPT_FIELDS = new Set(['v', 'claim', 'index', 'size', 'proof', 'root', 'anchor', 'attestation']);
const ANCHOR_FIELDS = new Set(['network', 'account', 'tx', 'ledger', 'closed_at', 'proof']);
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
  if (r.v !== 0 && r.v !== 1) fail('version');
  for (const k of Object.keys(r)) if (!RECEIPT_FIELDS.has(k)) fail(`field ${k}`);
  if (typeof r.claim !== 'string') fail('claim');
  if (!isCount(r.index)) fail('index');
  if (!isCount(r.size)) fail('size');
  if (!Array.isArray(r.proof) || !r.proof.every((p) => typeof p === 'string' && HEX64.test(p))) fail('proof');
  if (typeof r.root !== 'string' || !HEX64.test(r.root)) fail('root');
  const a = r.anchor;
  if (!isObject(a)) return fail('anchor');
  for (const k of Object.keys(a)) if (!ANCHOR_FIELDS.has(k)) fail(`field anchor.${k}`);
  if (a.network !== 'testnet' && a.network !== 'mainnet') fail('anchor.network');
  if (typeof a.account !== 'string' || !STELLAR_ACCOUNT.test(a.account)) fail('anchor.account');
  if (typeof a.tx !== 'string' || !HEX64.test(a.tx)) fail('anchor.tx');
  if (!isCount(a.ledger)) fail('anchor.ledger');
  if (typeof a.closed_at !== 'string' || Number.isNaN(Date.parse(a.closed_at))) fail('anchor.closed_at');
  // v1 fields, §8. A v0 receipt has none of them.
  if ('proof' in a && (r.v !== 1 || !isObject(a.proof))) fail('anchor.proof');
  if ('attestation' in r) {
    const t = r.attestation;
    if (r.v !== 1 || !isObject(t)) return fail('attestation');
    const keys = Object.keys(t).sort().join(',');
    const ok =
      (t.kind === 'android-key' &&
        keys === 'chain,kind' &&
        Array.isArray(t.chain) &&
        t.chain.length > 0 &&
        t.chain.every(isB64)) ||
      (t.kind === 'apple-app-attest' && keys === 'key_id,kind,object' && isB64(t.key_id) && isB64(t.object));
    if (!ok) fail('attestation');
  }
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
  const base = {
    keyLevel: receipt.attestation ? UNCHECKED_LEVEL : KEY_LEVEL,
    ...(receipt.attestation && { claimedAttestation: receipt.attestation.kind }),
    ...(receipt.anchor.proof !== undefined && { hasValidatorProof: true as const }),
    caveat: CAVEAT,
  } as const;
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

/** The levels an attestation kind can claim (SPEC.md §8.1), as the receipt alone tells them. */
export const CLAIMED_LEVEL: Record<Attestation['kind'], string> = {
  'android-key': 'tee or strongbox',
  'apple-app-attest': 'secure-enclave',
};

/** The key level line. A claimed hardware level is never shown as checked. */
export function keyLevelLine(v: Verdict): string {
  if (v.keyLevel === KEY_LEVEL || !v.claimedAttestation) return `Key level: ${KEY_LEVEL}`;
  return `Key level: ${CLAIMED_LEVEL[v.claimedAttestation]}, as claimed by its ${v.claimedAttestation} attestation. Not checked by this app.`;
}

/** Human-readable lines for a verdict, as SPEC.md §6 step 6 requires. */
export function verdictLines(v: Verdict): string[] {
  if (!v.ok) {
    return [`Failed at step ${v.stepNumber} (${v.failedStep}): ${v.reason}`, keyLevelLine(v), v.caveat];
  }
  return [
    `Unchanged since signed by key ${v.key}.`,
    `Existed no later than ${v.existedNoLaterThan} (ledger ${v.ledger}).`,
    `Device-claimed capture time: ${formatCaptured(v.deviceCaptured)} (the device clock is a claim, not evidence).`,
    keyLevelLine(v),
    v.caveat,
  ];
}

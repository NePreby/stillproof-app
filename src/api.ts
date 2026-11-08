// Client for the anchoring service, SPEC.md §7.
import type { Attestation } from '../modules/stillproof-keys';
import { ANCHOR_URL } from './config';
import { parseReceipt, type Receipt } from './protocol/receipt';

export async function submitClaim(signed: string): Promise<string> {
  const res = await fetch(`${ANCHOR_URL}/v1/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: signed,
  });
  if (res.status !== 202) throw new Error(`service rejected the claim (${res.status}): ${(await res.text()).trim()}`);
  const { id } = (await res.json()) as { id?: unknown };
  if (typeof id !== 'string') throw new Error('service returned no id');
  return id;
}

export type ReceiptResult =
  | { status: 'pending' }
  | { status: 'unknown' }
  | { status: 'anchored'; receipt: Receipt; json: string };

export async function fetchReceipt(id: string): Promise<ReceiptResult> {
  const res = await fetch(`${ANCHOR_URL}/v1/receipts/${id}`);
  if (res.status === 202) return { status: 'pending' };
  if (res.status === 404) return { status: 'unknown' };
  if (res.status !== 200) throw new Error(`service returned ${res.status}`);
  // Keep the service's exact bytes: that file is what gets shared.
  const json = await res.text();
  return { status: 'anchored', receipt: parseReceipt(json), json };
}

export type KeyRegistration = { accepted: true } | { accepted: false; reason: string };

const REGISTER_TIMEOUT_MS = 15000;

/** Registers a key's attestation, SPEC.md §8.4. Throws if the service can't be reached. */
export async function registerKey(key: string, attestation: Attestation): Promise<KeyRegistration> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REGISTER_TIMEOUT_MS);
  try {
    const res = await fetch(`${ANCHOR_URL}/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, attestation }),
      signal: abort.signal,
    });
    if (res.status === 204) return { accepted: true };
    if (res.status === 400) return { accepted: false, reason: (await res.text()).trim() || 'attestation rejected' };
    throw new Error(`service returned ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

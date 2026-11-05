// Client for the anchoring service, SPEC.md §7.
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

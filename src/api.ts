// Client for the anchoring service, SPEC.md §7.
import { anchorUrl } from './anchorUrl';
import { parseReceipt, type Receipt } from './protocol/receipt';

export async function submitClaim(signed: string): Promise<string> {
  const res = await fetch(`${await anchorUrl()}/v1/claims`, {
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
  const res = await fetch(`${await anchorUrl()}/v1/receipts/${id}`);
  if (res.status === 202) return { status: 'pending' };
  if (res.status === 404) return { status: 'unknown' };
  if (res.status !== 200) throw new Error(`service returned ${res.status}`);
  // Keep the service's exact bytes: that file is what gets shared.
  const json = await res.text();
  return { status: 'anchored', receipt: parseReceipt(json), json };
}

export type LookupResult =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'found'; receipts: { receipt: Receipt; json: string }[] };

/** Every anchored receipt for a file with this SHA-256, oldest first (SPEC.md §8.4). */
export async function lookupReceipts(sha256: string, fetchFn: typeof fetch = fetch): Promise<LookupResult> {
  const res = await fetchFn(`${await anchorUrl()}/v1/receipts?sha256=${sha256}`);
  if (res.status === 404) return { status: 'none' };
  if (res.status === 202) return { status: 'pending' };
  if (res.status !== 200) throw new Error(`service returned ${res.status}`);
  const body = (await res.json()) as { receipts?: unknown };
  if (!Array.isArray(body.receipts)) throw new Error('service returned no receipts list');
  if (body.receipts.length === 0) return { status: 'none' };
  return {
    status: 'found',
    receipts: body.receipts.map((r) => {
      const json = JSON.stringify(r);
      return { receipt: parseReceipt(json), json };
    }),
  };
}

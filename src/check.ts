// Checking a photo someone else took (PRD M3): with a receipt file, with a
// receipt embedded in the JPEG (SPEC.md §8.3), or by looking its hash up (§8.4).
// This only verifies. Anchoring stays capture-only: a picked photo can't attest its capture.
import { lookupReceipts, type LookupResult } from './api';
import { sha256Hex } from './protocol/claim';
import { C2paFormatError, readC2pa, type C2paRead } from './protocol/c2pa';
import { parseReceipt, verifyReceipt, type FetchTx, type Receipt, type Verdict } from './protocol/receipt';

export type Checked = { receipt: Receipt; verdict: Verdict };

export type CheckResult =
  /** Where the receipt came from, and one verdict per receipt. */
  | { found: 'file' | 'embedded' | 'lookup'; results: Checked[] }
  | { found: 'pending' }
  | { found: 'none' };

export type CheckDeps = {
  fetchTx: FetchTx;
  lookup?: (sha256: string) => Promise<LookupResult>;
};

/** Verifies photo bytes, with receiptJson if the user gave a receipt file. */
export async function checkPhoto(photo: Uint8Array, receiptJson: string | undefined, deps: CheckDeps): Promise<CheckResult> {
  const lookup = deps.lookup ?? ((h: string) => lookupReceipts(h));
  const verify = async (bytes: Uint8Array, receipt: Receipt) => ({ receipt, verdict: await verifyReceipt(bytes, receipt, deps.fetchTx) });

  if (receiptJson !== undefined) {
    const receipt = parseReceipt(receiptJson);
    let checked = await verify(photo, receipt);
    // A photo with a receipt embedded and also sent separately: check the signed bytes.
    if (!checked.verdict.ok && checked.verdict.failedStep === 'file') {
      let c2pa: C2paRead = { c2pa: false };
      try {
        c2pa = readC2pa(photo);
      } catch (e) {
        if (!(e instanceof C2paFormatError)) throw e;
      }
      if (c2pa.c2pa) checked = await verify(c2pa.original, receipt);
    }
    return { found: 'file', results: [checked] };
  }

  // A malformed C2PA store throws: a broken embedded receipt is reported, not skipped.
  const c2pa = readC2pa(photo);
  if (c2pa.c2pa && c2pa.receipt !== undefined) {
    return { found: 'embedded', results: [await verify(c2pa.original, parseReceipt(c2pa.receipt))] };
  }

  // Look up the file as given, then (if it has C2PA segments) the bytes without them.
  const candidates = c2pa.c2pa ? [photo, c2pa.original] : [photo];
  let pending = false;
  for (const bytes of candidates) {
    const r = await lookup(sha256Hex(bytes));
    if (r.status === 'pending') pending = true;
    if (r.status === 'found') {
      const results: Checked[] = [];
      for (const { receipt } of r.receipts) results.push(await verify(bytes, receipt));
      return { found: 'lookup', results };
    }
  }
  return pending ? { found: 'pending' } : { found: 'none' };
}

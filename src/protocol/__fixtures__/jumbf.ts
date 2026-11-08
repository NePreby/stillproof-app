// Test-only writer for C2PA APP11 JUMBF segments, per ISO/IEC 19566-5. Files
// written by the Go reference itself are in ./c2pa.
import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const C2PA = '6332706100110010800000aa00389b71';
export const C2MA = '63326d6100110010800000aa00389b71';
export const C2AS = '6332617300110010800000aa00389b71';
export const JSON_UUID = '6a736f6e00110010800000aa00389b71';

export function cat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const be = (n: number, w: number) => Uint8Array.from({ length: w }, (_, i) => (n >>> (8 * (w - 1 - i))) & 0xff);

export const box = (type: string, body: Uint8Array) => cat(be(8 + body.length, 4), utf8ToBytes(type), body);

export const superbox = (uuid: string, label: string, ...content: Uint8Array[]) =>
  box('jumb', cat(box('jumd', cat(hexToBytes(uuid), Uint8Array.of(0x03), utf8ToBytes(label), Uint8Array.of(0))), ...content));

/** A manifest store whose active (last) manifest has the receipt assertion. */
export function manifestStore(receiptJson: string, extraManifests: Uint8Array[] = []): Uint8Array {
  const assertion = superbox(JSON_UUID, 'org.stillproof.receipt', box('json', utf8ToBytes(receiptJson)));
  const manifest = superbox(C2MA, 'urn:uuid:00000000-0000-4000-8000-000000000000', superbox(C2AS, 'c2pa.assertions', assertion));
  return superbox(C2PA, 'c2pa', ...extraManifests, manifest);
}

/** APP11 segments for one JUMBF box, splitting it every `chunk` payload bytes. */
export function app11(jumbf: Uint8Array, en = 1, chunk = 65000): Uint8Array[] {
  const header = jumbf.subarray(0, 8);
  const segs: Uint8Array[] = [];
  for (let off = 0, z = 1; off < jumbf.length; z++) {
    const take = off === 0 ? jumbf.subarray(0, chunk) : cat(header, jumbf.subarray(off, off + chunk));
    off += off === 0 ? Math.min(chunk, jumbf.length) : Math.min(chunk, jumbf.length - off);
    const body = cat(utf8ToBytes('JP'), be(en, 2), be(z, 4), take);
    segs.push(cat(Uint8Array.of(0xff, 0xeb), be(body.length + 2, 2), body));
  }
  return segs;
}

/** A minimal JPEG: SOI, APP0, DQT, SOS with some scan bytes, EOI. */
export function jpeg(): Uint8Array {
  const seg = (m: number, body: number[]) => Uint8Array.of(0xff, m, ...be(body.length + 2, 2), ...body);
  return cat(
    Uint8Array.of(0xff, 0xd8),
    seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    seg(0xdb, Array.from({ length: 65 }, (_, i) => i)),
    seg(0xda, [1, 1, 0, 0, 0x3f, 0]),
    // Scan data, including bytes that look like an APP11 marker.
    Uint8Array.of(0x12, 0xff, 0x00, 0xff, 0xeb, 0x00, 0x04, 0x4a, 0x50, 0x99),
    Uint8Array.of(0xff, 0xd9),
  );
}

/** Inserts segments after APP0, as an embedder would. */
export function embed(original: Uint8Array, segments: Uint8Array[]): Uint8Array {
  const afterApp0 = 2 + 2 + ((original[4] << 8) | original[5]);
  return cat(original.subarray(0, afterApp0), ...segments, original.subarray(afterApp0));
}

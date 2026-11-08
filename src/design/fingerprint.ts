// The fingerprint of a SHA-256 (DESIGN.md): the first 16 bytes as 64 two-bit
// cells, most significant bits first, row by row in an 8 × 8 grid.

export type Tone = 0 | 1 | 2 | 3;

/** The theme token each tone is drawn in. */
export const TONE_TOKENS = ['bg', 'line', 'muted', 'text'] as const;

/** 64 tones, row-major. Tones 0–3 are drawn bg, line, muted, text. */
export function fingerprintCells(sha256: string): Tone[] {
  if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error('fingerprint needs a SHA-256 in hex');
  const cells: Tone[] = [];
  for (let i = 0; i < 16; i++) {
    const byte = parseInt(sha256.slice(i * 2, i * 2 + 2), 16);
    for (let shift = 6; shift >= 0; shift -= 2) cells.push(((byte >> shift) & 3) as Tone);
  }
  return cells;
}

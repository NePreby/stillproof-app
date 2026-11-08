import { darkroom, print } from '../../theme';
import { TONE_TOKENS, fingerprintCells } from '../fingerprint';
import { edge, edgeTime, frameNumber } from '../format';

describe('fingerprintCells', () => {
  it('reads two-bit cells, most significant bits first', () => {
    // 0x1b = 00 01 10 11, 0xe4 = 11 10 01 00
    const cells = fingerprintCells('1be4'.padEnd(64, '0'));
    expect(cells.slice(0, 8)).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
  });

  it('uses only the first 16 bytes, as 64 cells', () => {
    const a = fingerprintCells('ff'.repeat(16) + '00'.repeat(16));
    expect(a).toHaveLength(64);
    expect(a.every((t) => t === 3)).toBe(true);
    expect(fingerprintCells('ff'.repeat(16) + 'ab'.repeat(16))).toEqual(a);
  });

  it('lays cells out row by row', () => {
    // Byte 2 starts row 1 (cells 8–11).
    const cells = fingerprintCells('0000c0'.padEnd(64, '0'));
    expect(cells.indexOf(3)).toBe(8);
  });

  it('maps a whole hash exactly', () => {
    // 0x00 0x55 0xaa 0xff, then 0x1b 0xe4 0x27 0x93 …
    const hash = '0055aaff1be42793'.repeat(2) + 'ff'.repeat(16);
    const cells = fingerprintCells(hash);
    const row = [0, 0, 0, 0, 1, 1, 1, 1];
    expect(cells.slice(0, 8)).toEqual(row);
    expect(cells.slice(8, 16)).toEqual([2, 2, 2, 2, 3, 3, 3, 3]);
    expect(cells.slice(16, 24)).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);
    expect(cells.slice(24, 32)).toEqual([0, 2, 1, 3, 2, 1, 0, 3]);
    expect(cells.slice(32)).toEqual(cells.slice(0, 32));
  });

  it('draws tones 0–3 in bg, line, muted and text', () => {
    expect(TONE_TOKENS).toEqual(['bg', 'line', 'muted', 'text']);
    expect(TONE_TOKENS.map((t) => darkroom[t])).toEqual(['#0F0E0C', '#2E2A25', '#8E877B', '#EDE6D6']);
    expect(TONE_TOKENS.map((t) => print[t])).toEqual(['#F3EEE3', '#D2C9B6', '#6F685C', '#15130F']);
  });

  it('rejects anything but a SHA-256 in hex', () => {
    expect(() => fingerprintCells('abc')).toThrow();
    expect(() => fingerprintCells('z'.repeat(64))).toThrow();
  });
});

describe('edge labels', () => {
  it('formats times as on a film edge', () => {
    expect(edgeTime(Date.UTC(2026, 10, 5, 4, 8, 12))).toBe('05 NOV 2026 04:08:12 UTC');
    expect(edgeTime('2026-11-05T04:08:12Z')).toBe('05 NOV 2026 04:08:12 UTC');
    expect(edgeTime(Number.MAX_VALUE)).toBeUndefined();
  });

  it('joins parts and pads frame numbers', () => {
    expect(edge(`FRAME ${frameNumber(14)}`, false, 'LEDGER 5565275')).toBe('FRAME 014 · LEDGER 5565275');
  });
});

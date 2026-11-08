// Edge-label text: Fragment Mono, uppercase, as on the edge of a film strip.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** "05 NOV 2026 04:08:12 UTC", or undefined outside the Date range. */
export function edgeTime(ms: number | string): string | undefined {
  const d = new Date(typeof ms === 'string' ? Date.parse(ms) : ms);
  if (Number.isNaN(d.getTime())) return undefined;
  return (
    `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}

/** "014": frame numbers count from the first capture. */
export const frameNumber = (n: number) => pad(n, 3);

/** Joins edge-label parts with a middle dot. */
export const edge = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' · ');

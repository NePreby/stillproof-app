// The darkroom ledger design system (stillproof/docs/DESIGN.md).
import { useColorScheme } from 'react-native';

export type Palette = {
  bg: string;
  surface: string;
  line: string;
  muted: string;
  text: string;
  safelight: string;
  ok: string;
  fail: string;
};

export const darkroom: Palette = {
  bg: '#0F0E0C',
  surface: '#191714',
  line: '#2E2A25',
  muted: '#8E877B',
  text: '#EDE6D6',
  safelight: '#F2A33A',
  ok: '#9FDCA0',
  fail: '#F0563F',
};

export const print: Palette = {
  bg: '#F3EEE3',
  surface: '#EAE3D4',
  line: '#D2C9B6',
  muted: '#6F685C',
  text: '#15130F',
  safelight: '#B8651A',
  ok: '#2F7A45',
  fail: '#B83A26',
};

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 } as const;
export const radius = 2;
export const hairline = 1;

/** Font family names as loaded in App.tsx. */
export const fonts = {
  display: 'Gloock_400Regular',
  text: 'SchibstedGrotesk_400Regular',
  textMedium: 'SchibstedGrotesk_500Medium',
  textBold: 'SchibstedGrotesk_700Bold',
  mono: 'FragmentMono_400Regular',
} as const;

/** Type roles. Display never goes below 22 px. */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: fonts.text, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fonts.text, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.textMedium, fontSize: 15, lineHeight: 20 },
  data: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 19 },
  edge: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 15, letterSpacing: 11 * 0.12, textTransform: 'uppercase' },
} as const;

export type Scheme = 'darkroom' | 'print';

/** Darkroom by default; print when the system asks for light. */
export function useTheme(): { scheme: Scheme; c: Palette } {
  const scheme: Scheme = useColorScheme() === 'light' ? 'print' : 'darkroom';
  return { scheme, c: scheme === 'print' ? print : darkroom };
}

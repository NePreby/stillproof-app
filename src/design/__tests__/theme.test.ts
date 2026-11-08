import { darkroom, print } from '../../theme';

// The colour table of stillproof/docs/DESIGN.md.
it('has the DESIGN.md tokens', () => {
  expect(darkroom).toEqual({
    bg: '#0F0E0C',
    surface: '#191714',
    line: '#2E2A25',
    muted: '#8E877B',
    text: '#EDE6D6',
    safelight: '#F2A33A',
    ok: '#9FDCA0',
    fail: '#F0563F',
  });
  expect(print).toEqual({
    bg: '#F3EEE3',
    surface: '#EAE3D4',
    line: '#D2C9B6',
    muted: '#6F685C',
    text: '#15130F',
    safelight: '#B8651A',
    ok: '#2F7A45',
    fail: '#B83A26',
  });
});

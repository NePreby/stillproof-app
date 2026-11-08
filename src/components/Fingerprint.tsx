import { StyleSheet, View } from 'react-native';

import { TONE_TOKENS, fingerprintCells } from '../design/fingerprint';
import { hairline, space, useTheme } from '../theme';
import { Data, EdgeLabel } from './ui';

/** The 8 × 8 fingerprint of a SHA-256. It sits beside the hex, never replaces it. */
export function Fingerprint({ sha256, cell = 6 }: { sha256: string; cell?: number }) {
  const { c } = useTheme();
  const tones = TONE_TOKENS.map((t) => c[t]);
  const cells = fingerprintCells(sha256);
  const side = cell * 8 + 7;
  return (
    // Decorative: screen readers get the hex beside it.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { borderColor: c.line, backgroundColor: c.bg }]}
    >
      <View style={[styles.grid, { width: side, height: side }]}>
        {cells.map((tone, i) => (
          <View key={i} style={{ width: cell, height: cell, backgroundColor: tones[tone] }} />
        ))}
      </View>
    </View>
  );
}

/** A labelled SHA-256: fingerprint and hex. */
export function Hash({ label, sha256 }: { label: string; sha256: string }) {
  return (
    <View style={styles.hash} accessible accessibilityLabel={`${label}: ${sha256}`}>
      <Fingerprint sha256={sha256} />
      <View style={styles.hex}>
        <EdgeLabel>{label}</EdgeLabel>
        <Data>{sha256}</Data>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: hairline, padding: 2, alignSelf: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  hash: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  hex: { flex: 1, gap: space[1] },
});

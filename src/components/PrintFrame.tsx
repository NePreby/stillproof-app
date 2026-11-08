import { Image, StyleSheet, View } from 'react-native';

import { hairline, space, useTheme } from '../theme';
import { EdgeLabel } from './ui';

/** A photo framed like a print: a 1 px line border and an edge label under it. */
export function PrintFrame({ uri, edge, label, aspectRatio = 3 / 4 }: { uri: string; edge: string; label: string; aspectRatio?: number }) {
  const { c } = useTheme();
  return (
    <View style={styles.print}>
      <View style={[styles.frame, { borderColor: c.line, backgroundColor: c.surface }]}>
        <Image source={{ uri }} style={{ width: '100%', aspectRatio }} resizeMode="contain" accessibilityLabel={label} />
      </View>
      <EdgeLabel>{edge}</EdgeLabel>
    </View>
  );
}

const styles = StyleSheet.create({
  print: { gap: space[2] },
  frame: { borderWidth: hairline },
});

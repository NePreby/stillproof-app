import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme';

const SIZE = 72;
const RING = 3;
const GAP = 2;

/** The capture button: a safelight ring, a 2 px gap and a solid disc. The only round element. */
export function Shutter({ onPress, disabled, busy }: { onPress: () => void; disabled?: boolean; busy?: boolean }) {
  const { c } = useTheme();
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? 'Signing the photo' : 'Take photo'}
      accessibilityHint="Captures a photo and signs it on this device"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.ring, { borderColor: c.safelight, opacity: disabled ? 0.4 : 1 }, pressed && styles.pressed]}
    >
      <View style={[styles.disc, { backgroundColor: c.safelight, opacity: busy ? 0.35 : 1 }]} />
    </Pressable>
  );
}

const DISC = SIZE - 2 * RING - 2 * GAP;

const styles = StyleSheet.create({
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2 },
  pressed: { transform: [{ scale: 0.96 }] },
});

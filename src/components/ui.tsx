// Darkroom primitives: text roles, hairline buttons and rules (DESIGN.md).
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hairline, radius, space, type as t, useTheme } from '../theme';

export function Screen({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={[styles.screen, { paddingBottom: insets.bottom + space[6] }]}
    >
      {children}
    </ScrollView>
  );
}

type TextProps = { children: ReactNode; style?: StyleProp<TextStyle>; selectable?: boolean };

export function Display({ children, style }: TextProps) {
  const { c } = useTheme();
  return (
    <Text accessibilityRole="header" style={[t.display, { color: c.text }, style]}>
      {children}
    </Text>
  );
}

export function Title({ children, style }: TextProps) {
  const { c } = useTheme();
  return <Text style={[t.title, { color: c.text }, style]}>{children}</Text>;
}

export function Body({ children, style, muted, selectable }: TextProps & { muted?: boolean }) {
  const { c } = useTheme();
  return (
    <Text selectable={selectable} style={[t.body, { color: muted ? c.muted : c.text }, style]}>
      {children}
    </Text>
  );
}

export function Data({ children, style }: TextProps) {
  const { c } = useTheme();
  return (
    <Text selectable style={[t.data, { color: c.text }, style]}>
      {children}
    </Text>
  );
}

/** Fragment Mono, 11 px, uppercase, spaced: the edge print on a film strip. */
export function EdgeLabel({ children, style, color }: TextProps & { color?: string }) {
  const { c } = useTheme();
  return <Text style={[t.edge, { color: color ?? c.muted }, style]}>{children}</Text>;
}

export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: hairline, backgroundColor: c.line }, style]} />;
}

export function Button({
  title,
  onPress,
  disabled,
  primary,
  label,
  hint,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  /** Safelight. At most one per screen. */
  primary?: boolean;
  /** Accessibility label, if the title alone is not enough. */
  label?: string;
  hint?: string;
}) {
  const { c } = useTheme();
  const tint = disabled ? c.muted : primary ? c.safelight : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderColor: primary && !disabled ? c.safelight : c.line },
        pressed && { backgroundColor: c.surface },
      ]}
    >
      <Text style={[t.label, { color: tint }]}>{title}</Text>
    </Pressable>
  );
}

export function TextLink({ title, url, label }: { title: string; url: string; label?: string }) {
  const { c } = useTheme();
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={label ?? title}
      onPress={() => void Linking.openURL(url)}
      style={[t.small, { color: c.text, textDecorationLine: 'underline' }]}
    >
      {title}
    </Text>
  );
}

/** A labelled value: edge label above, text or data below. */
export function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={styles.field} accessible accessibilityLabel={`${label}: ${value}`}>
      <EdgeLabel>{label}</EdgeLabel>
      <Text style={[mono ? t.data : t.body, { color: c.text }]} selectable>
        {value}
      </Text>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <Text style={[t.body, { color: c.fail }]} accessibilityRole="alert">
      {children}
    </Text>
  );
}

export function Busy({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.busy} accessible accessibilityLabel={label}>
      <ActivityIndicator color={c.muted} />
      <EdgeLabel>{label}</EdgeLabel>
    </View>
  );
}

/** A plain full screen for loading and error states. */
export function Blank({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <View style={[styles.blank, { backgroundColor: c.bg }]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { padding: space[4], gap: space[4] },
  button: {
    borderWidth: hairline,
    borderRadius: radius,
    paddingVertical: space[3] + 2,
    paddingHorizontal: space[4],
    alignItems: 'center',
  },
  field: { gap: space[1] },
  busy: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2] },
  blank: { flex: 1, padding: space[4], gap: space[4], justifyContent: 'center' },
});

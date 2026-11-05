import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { verdictLines, type Verdict } from '../protocol/receipt';

export function Screen({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerStyle={styles.screen}>{children}</ScrollView>;
}

export function Button({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.buttonDim]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.field} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, mono && styles.mono]} selectable>
        {value}
      </Text>
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.error} accessibilityRole="alert">
      {children}
    </Text>
  );
}

/** A verdict, or a spinner while it is computed. */
export function VerdictView({ verdict }: { verdict: Verdict | 'checking' }) {
  if (verdict === 'checking') {
    return <ActivityIndicator accessibilityLabel="Checking the receipt" />;
  }
  return (
    <View style={[styles.verdict, verdict.ok ? styles.ok : styles.bad]} accessible accessibilityRole="summary">
      <Text style={styles.verdictTitle}>{verdict.ok ? 'Verified' : 'Not verified'}</Text>
      {verdictLines(verdict).map((line) => (
        <Text key={line} style={styles.verdictLine} selectable>
          {line}
        </Text>
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  button: { backgroundColor: '#1d4ed8', padding: 14, borderRadius: 8, alignItems: 'center' },
  buttonDim: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  field: { gap: 2 },
  label: { fontSize: 13, color: '#555' },
  value: { fontSize: 16, color: '#111' },
  mono: { fontFamily: 'monospace', fontSize: 13 },
  error: { color: '#b91c1c', fontSize: 15 },
  verdict: { padding: 12, borderRadius: 8, borderWidth: 2, gap: 6 },
  ok: { borderColor: '#15803d', backgroundColor: '#f0fdf4' },
  bad: { borderColor: '#b91c1c', backgroundColor: '#fef2f2' },
  verdictTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  verdictLine: { fontSize: 15, color: '#111' },
});

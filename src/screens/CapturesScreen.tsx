import { useEffect } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { pollPending, useCaptures, type Capture } from '../captures';
import { Button, styles as ui } from '../components/ui';
import { POLL_MS } from '../config';
import type { ScreenProps } from '../navigation';
import { formatCaptured } from '../protocol/receipt';

const STATUS_LABEL: Record<Capture['status'], string> = {
  pending: 'Pending: waiting for the anchor',
  anchored: 'Anchored',
  failed: 'Failed',
};

export default function CapturesScreen({ navigation }: ScreenProps<'Captures'>) {
  const captures = useCaptures();
  const anyPending = captures.some((c) => c.status === 'pending');

  useEffect(() => {
    if (!anyPending) return;
    void pollPending();
    const timer = setInterval(() => void pollPending(), POLL_MS);
    return () => clearInterval(timer);
  }, [anyPending]);

  return (
    <FlatList
      data={captures}
      keyExtractor={(c) => c.id}
      contentContainerStyle={ui.screen}
      ListHeaderComponent={
        <View style={styles.actions}>
          <Button title="Capture a photo" onPress={() => navigation.navigate('Capture')} />
          <Button title="Verify a file" onPress={() => navigation.navigate('Verify')} />
          <Button title="Device key" onPress={() => navigation.navigate('Key')} />
        </View>
      }
      ListEmptyComponent={<Text style={ui.value}>No captures yet.</Text>}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Capture from ${formatCaptured(BigInt(item.captured))}, ${STATUS_LABEL[item.status]}`}
          onPress={() => navigation.navigate('Detail', { id: item.id })}
          style={styles.row}
        >
          <Text style={ui.value}>{formatCaptured(BigInt(item.captured))}</Text>
          <Text style={[ui.label, item.status === 'failed' && ui.error]}>{STATUS_LABEL[item.status]}</Text>
          <Text style={ui.mono} numberOfLines={1}>
            {item.id}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8, marginBottom: 8 },
  row: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', gap: 4 },
});

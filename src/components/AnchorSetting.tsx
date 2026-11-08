import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { resetAnchorUrl, setAnchorUrl, useAnchorUrl } from '../anchorUrl';
import { ANCHOR_URL } from '../config';
import { hairline, radius, space, type as t, useTheme } from '../theme';
import { Body, Button, EdgeLabel, ErrorText } from './ui';

/** Edits the anchoring service URL, which changes when a phone reaches it through a tunnel. */
export function AnchorSetting() {
  const { c } = useTheme();
  const url = useAnchorUrl();
  const [draft, setDraft] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const value = draft ?? url;
  const changed = draft !== undefined && draft.trim() !== url;

  const run = (action: () => Promise<string>) => async () => {
    setError(undefined);
    setSaved(false);
    try {
      await action();
      setDraft(undefined);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.wrap}>
      <EdgeLabel>Anchoring service</EdgeLabel>
      <TextInput
        value={value}
        onChangeText={(s) => {
          setDraft(s);
          setSaved(false);
          setError(undefined);
        }}
        accessibilityLabel="Anchoring service URL"
        accessibilityHint="The address the app sends signed claims to"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        placeholder={ANCHOR_URL}
        placeholderTextColor={c.muted}
        selectionColor={c.text}
        style={[t.data, styles.input, { color: c.text, borderColor: error ? c.fail : c.line, backgroundColor: c.surface }]}
      />
      {error && <ErrorText>{error}</ErrorText>}
      {saved && <Body muted>Saved. New claims and lookups use {url}.</Body>}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title="Save" label="Save the anchoring service URL" disabled={!changed} onPress={run(() => setAnchorUrl(value))} />
        </View>
        <View style={styles.flex}>
          <Button
            title="Use default"
            label={`Use the default anchoring service, ${ANCHOR_URL}`}
            disabled={url === ANCHOR_URL && draft === undefined}
            onPress={run(resetAnchorUrl)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  input: { borderWidth: hairline, borderRadius: radius, paddingHorizontal: space[3], paddingVertical: space[3] },
  row: { flexDirection: 'row', gap: space[2] },
  flex: { flex: 1 },
});

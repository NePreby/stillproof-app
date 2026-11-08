import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { checkPhoto, type CheckResult } from '../check';
import { Hash } from '../components/Fingerprint';
import { PrintFrame } from '../components/PrintFrame';
import { ProofStrip } from '../components/ProofStrip';
import { Body, Busy, Button, EdgeLabel, ErrorText, Rule, Screen, Title } from '../components/ui';
import { edge } from '../design/format';
import { sha256Hex } from '../protocol/claim';
import { horizonFetchTx } from '../protocol/receipt';
import { space } from '../theme';

type Picked = { name: string; uri: string; image: boolean };
type Photo = Picked & { bytes: Uint8Array; sha256: string };

const SOURCE: Record<'file' | 'embedded' | 'lookup', string> = {
  file: 'Receipt from the file you chose',
  embedded: 'Receipt embedded in the photo',
  lookup: 'Receipt found by the photo’s hash',
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function fromLibrary(): Promise<Picked | undefined> {
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    exif: false,
    // iOS: hand over the stored file, not a converted copy.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  if (r.canceled) return undefined;
  const [a] = r.assets;
  return { name: a.fileName ?? 'Photo', uri: a.uri, image: true };
}

async function fromFiles(type: string | string[]): Promise<Picked | undefined> {
  const r = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true });
  if (r.canceled) return undefined;
  const [a] = r.assets;
  return { name: a.name, uri: a.uri, image: (a.mimeType ?? '').startsWith('image/') };
}

export default function VerifyScreen() {
  const [photo, setPhoto] = useState<Photo>();
  const [receipt, setReceipt] = useState<Picked>();
  const [result, setResult] = useState<CheckResult | 'checking'>();
  const [error, setError] = useState<string>();

  const choosePhoto = (pick: () => Promise<Picked | undefined>) => async () => {
    setError(undefined);
    try {
      const p = await pick();
      if (!p) return;
      const bytes = await new File(p.uri).bytes();
      setPhoto({ ...p, bytes, sha256: sha256Hex(bytes) });
      setResult(undefined);
    } catch (e) {
      setError(`Could not open the photo: ${message(e)}`);
    }
  };

  const chooseReceipt = async () => {
    setError(undefined);
    try {
      const p = await fromFiles(['application/json', '*/*']);
      if (p) {
        setReceipt(p);
        setResult(undefined);
      }
    } catch (e) {
      setError(`Could not open the receipt: ${message(e)}`);
    }
  };

  const check = async () => {
    if (!photo) return;
    setError(undefined);
    setResult('checking');
    try {
      const json = receipt ? await new File(receipt.uri).text() : undefined;
      setResult(await checkPhoto(photo.bytes, json, { fetchTx: horizonFetchTx() }));
    } catch (e) {
      setResult(undefined);
      setError(`Could not check the photo: ${message(e)}`);
    }
  };

  return (
    <Screen>
      <Body>
        Check a photo someone sent you. Stillproof reads a receipt embedded in the photo, or looks the photo&apos;s hash
        up with the anchoring service, then checks the anchor on Stellar.
      </Body>

      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title="From photos" label="Choose a photo from the library" onPress={choosePhoto(fromLibrary)} />
        </View>
        <View style={styles.flex}>
          <Button title="From files" label="Choose a photo from Files" onPress={choosePhoto(() => fromFiles('image/*'))} />
        </View>
      </View>
      <Body muted style={styles.note}>
        Files keeps the exact bytes. The photo library can hand over a converted copy, which won&apos;t match.
      </Body>

      {photo && (
        <View style={styles.block}>
          {photo.image ? (
            <PrintFrame uri={photo.uri} label={`The photo to check, ${photo.name}`} edge={edge(photo.name, `${photo.bytes.length} bytes`)} />
          ) : (
            <EdgeLabel>{edge(photo.name, `${photo.bytes.length} bytes`)}</EdgeLabel>
          )}
          <Hash label="File SHA-256" sha256={photo.sha256} />
        </View>
      )}

      <View style={styles.block}>
        <EdgeLabel>{receipt ? edge('Receipt', receipt.name) : 'Receipt · optional'}</EdgeLabel>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Button
              title={receipt ? 'Change receipt' : 'Add a receipt file'}
              label={receipt ? 'Choose a different receipt file' : 'Add a receipt file'}
              onPress={() => void chooseReceipt()}
            />
          </View>
          {receipt && (
            <View style={styles.flex}>
              <Button
                title="Remove"
                label="Remove the receipt file"
                onPress={() => {
                  setReceipt(undefined);
                  setResult(undefined);
                }}
              />
            </View>
          )}
        </View>
      </View>

      <Button primary title="Check" label="Check the photo" onPress={() => void check()} disabled={!photo || result === 'checking'} />
      {error && <ErrorText>{error}</ErrorText>}

      {result === 'checking' && <Busy label="Looking for proof" />}
      {result && result !== 'checking' && <Result result={result} />}
    </Screen>
  );
}

function Result({ result }: { result: CheckResult }) {
  if (result.found === 'none') {
    return (
      <View style={styles.block} accessibilityRole="summary">
        <Rule />
        <Title>No proof found for this photo</Title>
        <Body muted>
          It carries no receipt, and the anchoring service has none for its hash. An edited or re-encoded copy has a
          different hash from the original.
        </Body>
      </View>
    );
  }
  if (result.found === 'pending') {
    return (
      <View style={styles.block} accessibilityRole="summary">
        <Rule />
        <Title>Not anchored yet</Title>
        <Body muted>The service has a claim for this photo that is waiting to be anchored. Check again in a minute.</Body>
      </View>
    );
  }
  return (
    <>
      {result.results.map(({ receipt, verdict }, i) => (
        <View key={`${receipt.anchor.tx}-${i}`} style={styles.block}>
          <Rule />
          <EdgeLabel>
            {edge(SOURCE[result.found], result.results.length > 1 && `${i + 1} of ${result.results.length}`, `Ledger ${receipt.anchor.ledger}`)}
          </EdgeLabel>
          <ProofStrip verdict={verdict} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space[2] },
  flex: { flex: 1 },
  block: { gap: space[3] },
  note: { marginTop: -space[2] },
});

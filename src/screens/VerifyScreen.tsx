import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, ErrorText, Field, Screen, VerdictView, styles as ui } from '../components/ui';
import { horizonFetchTx, parseReceipt, verifyReceipt, type Verdict } from '../protocol/receipt';

type Picked = { name: string; uri: string };

async function pick(type: string | string[]): Promise<Picked | undefined> {
  const result = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true });
  if (result.canceled) return undefined;
  const [asset] = result.assets;
  return { name: asset.name, uri: asset.uri };
}

export default function VerifyScreen() {
  const [file, setFile] = useState<Picked>();
  const [receipt, setReceipt] = useState<Picked>();
  const [verdict, setVerdict] = useState<Verdict | 'checking'>();
  const [error, setError] = useState<string>();

  const choose = (type: string | string[], set: (p: Picked) => void) => async () => {
    setError(undefined);
    try {
      const p = await pick(type);
      if (p) {
        set(p);
        setVerdict(undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const verify = async () => {
    if (!file || !receipt) return;
    setError(undefined);
    setVerdict('checking');
    try {
      const parsed = parseReceipt(await new File(receipt.uri).text());
      setVerdict(await verifyReceipt(await new File(file.uri).bytes(), parsed, horizonFetchTx()));
    } catch (e) {
      setVerdict(undefined);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Text style={ui.value}>
        Check a photo against its Stillproof receipt. This reads the anchor transaction from Stellar&apos;s Horizon
        API; nothing else leaves the phone.
      </Text>
      <Button title="Choose photo" onPress={choose('*/*', setFile)} />
      <Field label="Photo" value={file?.name ?? 'None chosen'} />
      <Button title="Choose receipt" onPress={choose(['application/json', '*/*'], setReceipt)} />
      <Field label="Receipt" value={receipt?.name ?? 'None chosen'} />
      <Button title="Verify" onPress={verify} disabled={!file || !receipt || verdict === 'checking'} />
      {error && <ErrorText>{error}</ErrorText>}
      {verdict && <VerdictView verdict={verdict} />}
    </Screen>
  );
}

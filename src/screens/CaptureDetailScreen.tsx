import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text } from 'react-native';

import { photoFile, receiptFile, submit, useCapture } from '../captures';
import { Button, ErrorText, Field, Screen, VerdictView, styles as ui } from '../components/ui';
import type { ScreenProps } from '../navigation';
import { KEY_LEVEL, formatCaptured, horizonFetchTx, parseReceipt, verifyReceipt, type Verdict } from '../protocol/receipt';

export default function CaptureDetailScreen({ route }: ScreenProps<'Detail'>) {
  const capture = useCapture(route.params.id);
  const [verdict, setVerdict] = useState<Verdict>();
  const [verifyError, setVerifyError] = useState<string>();
  const [shareError, setShareError] = useState<string>();
  const anchored = capture?.status === 'anchored';

  useEffect(() => {
    if (!capture || !anchored) return;
    let live = true;
    (async () => {
      const bytes = await photoFile(capture).bytes();
      const receipt = parseReceipt(await receiptFile(capture).text());
      const v = await verifyReceipt(bytes, receipt, horizonFetchTx());
      if (live) setVerdict(v);
    })().catch((e) => live && setVerifyError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
    // Re-verify only when the capture becomes anchored, not on every store change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture?.id, anchored]);

  if (!capture) return <ErrorText>This capture no longer exists.</ErrorText>;

  const share = async (uri: string, mimeType: string) => {
    try {
      await Sharing.shareAsync(uri, { mimeType });
    } catch (e) {
      setShareError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen>
      <Image
        source={{ uri: photoFile(capture).uri }}
        style={styles.photo}
        resizeMode="contain"
        accessibilityLabel="The captured photo"
      />
      <Field label="Status" value={capture.status} />
      {capture.error && <ErrorText>{capture.error}</ErrorText>}
      <Field label="Device-claimed capture time" value={formatCaptured(BigInt(capture.captured))} />
      <Field label="Claim id" value={capture.id} mono />
      <Field label="Key level" value={KEY_LEVEL} />

      {capture.status === 'failed' && <Button title="Submit again" onPress={() => void submit(capture)} />}
      {capture.status === 'pending' && (
        <Text style={ui.value}>Waiting for the service to anchor this claim on Stellar.</Text>
      )}
      {anchored && !verifyError && <VerdictView verdict={verdict ?? 'checking'} />}
      {verifyError && <ErrorText>Could not check the receipt: {verifyError}</ErrorText>}

      <Button title="Share photo" onPress={() => void share(photoFile(capture).uri, capture.type)} />
      {anchored && (
        <Button title="Share receipt" onPress={() => void share(receiptFile(capture).uri, 'application/json')} />
      )}
      {anchored && <Text style={ui.label}>Send both files: the receipt only verifies with the original photo.</Text>}
      {shareError && <ErrorText>{shareError}</ErrorText>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#000' },
});

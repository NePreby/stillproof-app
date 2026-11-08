import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { AnchorSetting } from '../components/AnchorSetting';
import { Blank, Body, Busy, Button, ErrorText, Field, Rule, Screen } from '../components/ui';
import { NETWORK } from '../config';
import { deviceKey, newKey, retryRegistration, type DeviceKey, type Registration } from '../keys';

const registrationText: Record<Registration['status'], string> = {
  none: 'No attestation',
  pending: 'Not registered yet',
  registered: 'Attestation accepted',
  rejected: 'Attestation rejected',
};

export default function KeyScreen() {
  const [key, setKey] = useState<DeviceKey>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    deviceKey().then(setKey, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const replace = (next: () => Promise<DeviceKey>) => {
    setBusy(true);
    next()
      .then(setKey, (e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  if (error) {
    return (
      <Blank>
        <ErrorText>Could not load the device key: {error}</ErrorText>
      </Blank>
    );
  }
  if (!key) {
    return (
      <Blank>
        <Busy label="Loading the device key" />
      </Blank>
    );
  }

  const r = key.registration;
  const detail = r.status === 'pending' ? `: ${r.error}` : r.status === 'rejected' ? `: ${r.reason}` : '';

  return (
    <Screen>
      <Field label="Public key · P-256 · SEC1 uncompressed" value={key.publicKey()} mono />
      <Field label="Key level" value={key.level} />
      <Field label="Device claims" value={key.claimed} />
      <Field label="Attestation" value={registrationText[r.status] + detail} />
      <Body muted>
        Receipts show a hardware level only for a hardware key whose attestation the anchoring service accepted.
        Otherwise they show software.
      </Body>
      {r.status === 'pending' ? (
        <Button title="Retry registration" disabled={busy} onPress={() => replace(retryRegistration)} />
      ) : null}
      <Button
        title="New key"
        disabled={busy}
        onPress={() =>
          Alert.alert('New key', 'This key is deleted. Photos already signed keep their receipts.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'New key', style: 'destructive', onPress: () => replace(newKey) },
          ])
        }
      />
      <Rule />
      <AnchorSetting />
      <Field label="Network" value={NETWORK} />
    </Screen>
  );
}

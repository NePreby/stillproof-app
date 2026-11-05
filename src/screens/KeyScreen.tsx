import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { ErrorText, Field, Screen, styles as ui } from '../components/ui';
import { ANCHOR_URL, NETWORK } from '../config';
import { deviceKey, type DeviceKey } from '../keys';

export default function KeyScreen() {
  const [key, setKey] = useState<DeviceKey>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    deviceKey().then(setKey, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!key) return <ActivityIndicator accessibilityLabel="Loading the device key" />;

  return (
    <Screen>
      <Field label="Public key (P-256, SEC1 uncompressed)" value={key.publicKey()} mono />
      <Field label="Key level" value={key.level} />
      <Text style={ui.label}>
        This is a software key held in the operating system&apos;s secure storage. Hardware-backed keys arrive in a
        later version.
      </Text>
      <Field label="Anchoring service" value={ANCHOR_URL} mono />
      <Field label="Network" value={NETWORK} />
    </Screen>
  );
}

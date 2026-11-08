import { useEffect, useState } from 'react';

import { AnchorSetting } from '../components/AnchorSetting';
import { Blank, Body, Busy, ErrorText, Field, Rule, Screen } from '../components/ui';
import { NETWORK } from '../config';
import { deviceKey, type DeviceKey } from '../keys';

export default function KeyScreen() {
  const [key, setKey] = useState<DeviceKey>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    deviceKey().then(setKey, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

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

  return (
    <Screen>
      <Field label="Public key · P-256 · SEC1 uncompressed" value={key.publicKey()} mono />
      <Field label="Key level" value={key.level} />
      <Body muted>
        This is a software key held in the operating system&apos;s secure storage. Hardware-backed keys arrive in a
        later version.
      </Body>
      <Rule />
      <AnchorSetting />
      <Field label="Network" value={NETWORK} />
    </Screen>
  );
}

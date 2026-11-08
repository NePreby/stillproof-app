import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createCapture, useCaptures } from '../captures';
import { Shutter } from '../components/Shutter';
import { Blank, Body, Busy, Button, Display, EdgeLabel, ErrorText } from '../components/ui';
import { edge, frameNumber } from '../design/format';
import type { ScreenProps } from '../navigation';
import { hairline, space, useTheme } from '../theme';

export default function CaptureScreen({ navigation }: ScreenProps<'Capture'>) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const next = frameNumber(useCaptures().length + 1);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel="Back to the contact sheet" onPress={navigation.goBack} hitSlop={12}>
      <EdgeLabel style={{ color: c.text }}>← Back</EdgeLabel>
    </Pressable>
  );

  if (!permission) {
    return (
      <Blank>
        <Busy label="Checking camera permission" />
      </Blank>
    );
  }
  if (!permission.granted) {
    return (
      <Blank>
        {back}
        <Display>Camera</Display>
        <Body>Stillproof signs a photo the moment the camera takes it, so it needs the camera.</Body>
        <Body muted>To check a photo you didn&apos;t take here, use Check a photo instead.</Body>
        <Button primary title="Allow camera" onPress={requestPermission} />
      </Blank>
    );
  }

  const shoot = async () => {
    if (!camera.current) return;
    setBusy(true);
    setError(undefined);
    try {
      const capturedAt = Date.now();
      const picture = await camera.current.takePictureAsync({ exif: false });
      const capture = await createCapture(picture.uri, capturedAt);
      navigation.replace('Detail', { id: capture.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={[styles.top, { paddingTop: insets.top + space[2] }]}>
        {back}
        <EdgeLabel>{edge(`Frame ${next}`, busy ? 'Signing' : ready ? 'Ready' : 'Starting camera')}</EdgeLabel>
      </View>
      <View style={[styles.gate, { borderColor: c.line }]}>
        <CameraView
          ref={camera}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setReady(true)}
          accessibilityLabel="Camera viewfinder"
        />
      </View>
      <View style={[styles.controls, { paddingBottom: insets.bottom + space[5] }]}>
        {error && <ErrorText>Could not capture: {error}</ErrorText>}
        <Shutter onPress={() => void shoot()} disabled={!ready} busy={busy} />
        <EdgeLabel>Signed on this device · anchored on Stellar</EdgeLabel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingBottom: space[3],
  },
  gate: { flex: 1, marginHorizontal: space[4], borderWidth: hairline, overflow: 'hidden' },
  camera: { flex: 1 },
  controls: { alignItems: 'center', gap: space[3], paddingTop: space[5], paddingHorizontal: space[4] },
});

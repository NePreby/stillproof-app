import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { createCapture } from '../captures';
import { Button, ErrorText, Screen, styles as ui } from '../components/ui';
import type { ScreenProps } from '../navigation';

export default function CaptureScreen({ navigation }: ScreenProps<'Capture'>) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!permission) return <ActivityIndicator accessibilityLabel="Checking camera permission" />;
  if (!permission.granted) {
    return (
      <Screen>
        <Text style={ui.value}>Stillproof needs the camera to capture photos. Photos can&apos;t be imported.</Text>
        <Button title="Allow camera" onPress={requestPermission} />
      </Screen>
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
    <View style={styles.container}>
      <CameraView ref={camera} style={styles.camera} facing="back" onCameraReady={() => setReady(true)} />
      <View style={styles.controls}>
        {error && <ErrorText>{error}</ErrorText>}
        {busy ? (
          <ActivityIndicator accessibilityLabel="Signing the photo" />
        ) : (
          <Button title="Take photo" onPress={shoot} disabled={!ready} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  controls: { padding: 16, gap: 8 },
});

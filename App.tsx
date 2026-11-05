import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import type { RootStackParamList } from './src/navigation';
import CaptureDetailScreen from './src/screens/CaptureDetailScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import CapturesScreen from './src/screens/CapturesScreen';
import KeyScreen from './src/screens/KeyScreen';
import VerifyScreen from './src/screens/VerifyScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Captures" component={CapturesScreen} options={{ title: 'Stillproof' }} />
        <Stack.Screen name="Capture" component={CaptureScreen} options={{ title: 'Capture' }} />
        <Stack.Screen name="Detail" component={CaptureDetailScreen} options={{ title: 'Capture' }} />
        <Stack.Screen name="Verify" component={VerifyScreen} options={{ title: 'Verify a file' }} />
        <Stack.Screen name="Key" component={KeyScreen} options={{ title: 'Device key' }} />
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}

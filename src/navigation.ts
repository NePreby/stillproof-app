import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Captures: undefined;
  Capture: undefined;
  Detail: { id: string };
  Verify: undefined;
  Key: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

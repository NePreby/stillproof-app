import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { softwareSigner } from './protocol/claim';

/**
 * The device signing key. M3 replaces the software key with an Android
 * Keystore / Secure Enclave key behind this same interface.
 */
export interface DeviceKey {
  readonly level: 'software';
  /** SEC1 uncompressed public key, lowercase hex. */
  publicKey(): string;
  /** ECDSA P-256 over SHA-256(message), as r‖s. */
  sign(message: Uint8Array): Promise<Uint8Array>;
}

const STORE_KEY = 'stillproof.p256.v0';
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function softwareKey(privateKey: Uint8Array): DeviceKey {
  const pub = bytesToHex(p256.getPublicKey(privateKey, false));
  const signer = softwareSigner(privateKey);
  return {
    level: 'software',
    publicKey: () => pub,
    sign: async (message) => signer(message),
  };
}

let loading: Promise<DeviceKey> | undefined;

/** Loads the device key, generating and storing it on first use. */
export function deviceKey(): Promise<DeviceKey> {
  loading ??= (async () => {
    const stored = await SecureStore.getItemAsync(STORE_KEY, STORE_OPTIONS);
    if (stored) return softwareKey(hexToBytes(stored));
    const privateKey = p256.utils.randomSecretKey(getRandomBytes(p256.lengths.seed!));
    await SecureStore.setItemAsync(STORE_KEY, bytesToHex(privateKey), STORE_OPTIONS);
    return softwareKey(privateKey);
  })().catch((e) => {
    loading = undefined;
    throw e;
  });
  return loading;
}

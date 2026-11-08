import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import Native, { type Attestation, type ClaimedLevel, type StillproofKeysModule } from '../modules/stillproof-keys';
import { registerKey } from './api';
import { softwareSigner } from './protocol/claim';

export type { Attestation };
export type KeyLevel = ClaimedLevel;

/** Where the key's attestation stands with the anchoring service, SPEC.md §8.4. */
export type Registration =
  | { status: 'none' } // a software key, or a hardware key without an attestation
  | { status: 'pending'; error: string } // not yet accepted or rejected: the service was unreachable
  | { status: 'registered' }
  | { status: 'rejected'; reason: string };

/** The device signing key: hardware-backed where possible, else a software key. */
export interface DeviceKey {
  /** The level receipts show: the claimed level once the service accepted the attestation, else software. */
  readonly level: KeyLevel;
  /** The level the device claims for the key. */
  readonly claimed: KeyLevel;
  readonly registration: Registration;
  /** SEC1 uncompressed public key, lowercase hex. */
  publicKey(): string;
  /** The key's attestation, SPEC.md §8.1, or null if it has none. */
  attestation(): Promise<Attestation | null>;
  /** ECDSA P-256 over SHA-256(message), as r‖s with low s. */
  sign(message: Uint8Array): Promise<Uint8Array>;
}

const STORE_KEY = 'stillproof.p256.v0';
const HARDWARE_KEY = 'stillproof.hardware.v1';
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

type HardwareState = { publicKey: string; claimed: KeyLevel; registration: Registration };

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

function softwareKey(privateKey: Uint8Array): DeviceKey {
  const pub = bytesToHex(p256.getPublicKey(privateKey, false));
  const signer = softwareSigner(privateKey);
  return {
    level: 'software',
    claimed: 'software',
    registration: { status: 'none' },
    publicKey: () => pub,
    attestation: async () => null,
    sign: async (message) => signer(message),
  };
}

function hardwareKey(native: StillproofKeysModule, state: HardwareState): DeviceKey {
  return {
    level: state.registration.status === 'registered' ? state.claimed : 'software',
    claimed: state.claimed,
    registration: state.registration,
    publicKey: () => state.publicKey,
    attestation: () => native.attestation().catch(() => null),
    sign: async (message) => {
      const sig = hexToBytes(await native.sign(bytesToHex(message)));
      if (sig.length !== 64) throw new Error('hardware key returned a malformed signature');
      return sig;
    },
  };
}

async function saveHardware(state: HardwareState): Promise<void> {
  await SecureStore.setItemAsync(HARDWARE_KEY, JSON.stringify(state), STORE_OPTIONS);
}

/** Sends the attestation to the service and records the answer. */
async function register(native: StillproofKeysModule, state: HardwareState): Promise<HardwareState> {
  let registration: Registration;
  const attestation = await native.attestation().catch(() => null);
  if (!attestation) {
    registration = { status: 'none' };
  } else {
    try {
      const r = await registerKey(state.publicKey, attestation);
      registration = r.accepted ? { status: 'registered' } : { status: 'rejected', reason: r.reason };
    } catch (e) {
      registration = { status: 'pending', error: errorMessage(e) };
    }
  }
  const next = { ...state, registration };
  await saveHardware(next);
  return next;
}

async function createHardware(native: StillproofKeysModule): Promise<DeviceKey> {
  try {
    const info = await native.generateKey();
    p256.Point.fromHex(info.publicKey).assertValidity();
    const state: HardwareState = { publicKey: info.publicKey, claimed: info.level, registration: { status: 'none' } };
    const key = hardwareKey(native, state);
    // Check the key signs before relying on it.
    const probe = utf8ToBytes('stillproof/key/probe');
    const sig = await key.sign(probe);
    if (!p256.verify(sig, sha256(probe), hexToBytes(info.publicKey), { prehash: false, lowS: true, format: 'compact' })) {
      throw new Error('hardware key produced an invalid signature');
    }
    await saveHardware(state);
    return hardwareKey(native, await register(native, state));
  } catch (e) {
    await native.deleteKey().catch(() => {});
    throw e;
  }
}

async function createSoftware(): Promise<DeviceKey> {
  const privateKey = p256.utils.randomSecretKey(getRandomBytes(p256.lengths.seed!));
  await SecureStore.setItemAsync(STORE_KEY, bytesToHex(privateKey), STORE_OPTIONS);
  return softwareKey(privateKey);
}

/** A new key: hardware if the device can make one, else software. */
async function create(): Promise<DeviceKey> {
  if (Native) {
    try {
      return await createHardware(Native);
    } catch {
      // No usable hardware key: fall back to software.
    }
  }
  return createSoftware();
}

async function loadHardware(native: StillproofKeysModule): Promise<DeviceKey | undefined> {
  const raw = await SecureStore.getItemAsync(HARDWARE_KEY, STORE_OPTIONS);
  if (!raw) return undefined;
  let state = JSON.parse(raw) as HardwareState;
  const info = await native.loadKey();
  if (info?.publicKey !== state.publicKey) {
    await SecureStore.deleteItemAsync(HARDWARE_KEY, STORE_OPTIONS);
    return undefined;
  }
  if (state.registration.status === 'pending') state = await register(native, state);
  return hardwareKey(native, state);
}

async function load(): Promise<DeviceKey> {
  const hardware = Native ? await loadHardware(Native) : undefined;
  if (hardware) return hardware;
  // Existing software keys stay until the user asks for a new key.
  const stored = await SecureStore.getItemAsync(STORE_KEY, STORE_OPTIONS);
  if (stored) return softwareKey(hexToBytes(stored));
  return create();
}

let loading: Promise<DeviceKey> | undefined;

function cache(p: Promise<DeviceKey>): Promise<DeviceKey> {
  loading = p.catch((e) => {
    loading = undefined;
    throw e;
  });
  return loading;
}

/** Loads the device key, generating and storing it on first use. */
export function deviceKey(): Promise<DeviceKey> {
  return loading ?? cache(load());
}

/** Replaces the device key with a new one. Captures already signed keep their old key. */
export function newKey(): Promise<DeviceKey> {
  const previous = loading;
  return cache(
    (async () => {
      await previous?.catch(() => {});
      await SecureStore.deleteItemAsync(HARDWARE_KEY, STORE_OPTIONS);
      await SecureStore.deleteItemAsync(STORE_KEY, STORE_OPTIONS);
      await Native?.deleteKey().catch(() => {});
      return create();
    })(),
  );
}

/** Retries a pending registration. */
export function retryRegistration(): Promise<DeviceKey> {
  const previous = loading;
  loading = undefined;
  return cache(
    (async () => {
      await previous?.catch(() => {});
      return load();
    })(),
  );
}

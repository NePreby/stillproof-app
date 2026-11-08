import { requireOptionalNativeModule } from 'expo';

/** A key attestation, SPEC.md §8.1. */
export type Attestation =
  | { kind: 'android-key'; chain: string[] }
  | { kind: 'apple-app-attest'; key_id: string; object: string };

/** The level the device claims for its key. Only the anchoring service's acceptance makes it count. */
export type ClaimedLevel = 'strongbox' | 'tee' | 'secure-enclave' | 'software';

export type HardwareKeyInfo = {
  /** SEC1 uncompressed public key, lowercase hex. */
  publicKey: string;
  level: ClaimedLevel;
};

export interface StillproofKeysModule {
  /** Generates the claim key, replacing any existing one. */
  generateKey(): Promise<HardwareKeyInfo>;
  /** The stored claim key, or null. */
  loadKey(): Promise<HardwareKeyInfo | null>;
  /** SEC1 uncompressed public key (65 bytes), lowercase hex. Rejects if there is no key. */
  publicKey(): Promise<string>;
  /** Android only: the attestation chain, base64 DER, leaf first. */
  attestationChain?(): Promise<string[]>;
  /** The key's attestation. Rejects if there is none. */
  attestation(): Promise<Attestation>;
  /** ECDSA P-256 over SHA-256(message), message in hex. Returns r‖s with low s (SPEC.md §2), hex. */
  sign(messageHex: string): Promise<string>;
  deleteKey(): Promise<void>;
}

/** The native module, or null where it isn't built in (web, Expo Go, tests). */
export default requireOptionalNativeModule<StillproofKeysModule>('StillproofKeys');

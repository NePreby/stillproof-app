import type { Network } from './protocol/receipt';

/**
 * The default anchoring service, which the Key screen can override at runtime.
 * Set EXPO_PUBLIC_ANCHOR_URL at build time; the default
 * is the host machine as seen from the Android emulator.
 */
export const ANCHOR_URL = (process.env.EXPO_PUBLIC_ANCHOR_URL || 'http://10.0.2.2:8080').replace(/\/+$/, '');

/** The Stellar network receipts from ANCHOR_URL must be anchored on. */
export const NETWORK: Network = 'testnet';

/** How often pending captures ask the service for their receipt. */
export const POLL_MS = 5000;

/** The web verifier, which checks attestation chains and validator proofs. */
export const WEB_VERIFIER_URL = 'https://stillproof-labs.github.io/stillproof/';

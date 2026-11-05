// Must be imported before @noble/curves: it probes crypto.getRandomValues at load
// time for signing side-channel blinding, and Hermes has no Web Crypto.
import { getRandomValues } from 'expo-crypto';

const g = globalThis as { crypto?: Partial<Crypto> };
if (typeof g.crypto?.getRandomValues !== 'function') {
  g.crypto = { ...g.crypto, getRandomValues: getRandomValues as Crypto['getRandomValues'] };
}

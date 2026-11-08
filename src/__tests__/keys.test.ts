import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

import type { Attestation, StillproofKeysModule } from '../../modules/stillproof-keys';
import type * as Keys from '../keys';
import { buildClaim, signClaim, verifyClaim } from '../protocol/claim';

const N = p256.Point.CURVE().n;
const CHAIN: Attestation = { kind: 'android-key', chain: ['bGVhZg==', 'cm9vdA=='] };

// SecureStore survives jest.resetModules, as secure storage on the device survives an app restart.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)),
}));

/** A fake native module: r‖s with low s, as the Kotlin and Swift code return it. */
type FakeNative = jest.Mocked<StillproofKeysModule> & { privateKey?: Uint8Array };

function fakeNative(): FakeNative {
  const native: FakeNative = {
    privateKey: undefined,
    generateKey: jest.fn(async () => {
      native.privateKey = p256.utils.randomSecretKey();
      return { publicKey: bytesToHex(p256.getPublicKey(native.privateKey, false)), level: 'tee' as const };
    }),
    loadKey: jest.fn(async () =>
      native.privateKey
        ? { publicKey: bytesToHex(p256.getPublicKey(native.privateKey, false)), level: 'tee' as const }
        : null,
    ),
    publicKey: jest.fn(async () => {
      if (!native.privateKey) throw new Error('no key');
      return bytesToHex(p256.getPublicKey(native.privateKey, false));
    }),
    attestation: jest.fn(async () => {
      if (!native.privateKey) throw new Error('no key');
      return CHAIN;
    }),
    sign: jest.fn(async (hex: string) => {
      const sig = p256.sign(sha256(hexToBytes(hex)), native.privateKey!, { prehash: false, lowS: true, format: 'compact' });
      return bytesToHex(sig);
    }),
    deleteKey: jest.fn(async () => {
      native.privateKey = undefined;
    }),
  };
  return native;
}

let native: FakeNative | null;
const fetchMock = jest.fn();
const fetchCalls: [string, RequestInit][] = [];

function keys(): typeof Keys {
  jest.resetModules();
  jest.doMock('../../modules/stillproof-keys', () => ({ __esModule: true, default: native }));
  return jest.requireActual<typeof Keys>('../keys');
}

const respond = (status: number, body = '') => fetchMock.mockResolvedValueOnce(new Response(body || null, { status }));

beforeEach(() => {
  mockStore.clear();
  native = fakeNative();
  fetchMock.mockReset();
  fetchCalls.length = 0;
  // A plain wrapper: Jest 30's resetModules clears mocks installed on globals.
  globalThis.fetch = (input, init) => {
    fetchCalls.push([String(input), init!]);
    return fetchMock(input, init);
  };
});

async function expectSigns(key: Keys.DeviceKey) {
  const c = buildClaim(utf8ToBytes('photo'), 'image/jpeg', 1700000000000n, key.publicKey());
  const signed = await signClaim(c, (m) => key.sign(m));
  expect(verifyClaim(signed)).toBe(true);
}

it('uses a registered hardware key', async () => {
  respond(204);
  const key = await keys().deviceKey();
  expect(native!.generateKey).toHaveBeenCalledTimes(1);
  expect(key).toMatchObject({ level: 'tee', claimed: 'tee', registration: { status: 'registered' } });
  expect(key.publicKey()).toBe(bytesToHex(p256.getPublicKey(native!.privateKey!, false)));
  expect(await key.attestation()).toEqual(CHAIN);
  const [url, init] = fetchCalls[0];
  expect(url).toMatch(/\/v1\/keys$/);
  expect(JSON.parse(init.body as string)).toEqual({ key: key.publicKey(), attestation: CHAIN });
  await expectSigns(key);

  // After a restart the same key loads without generating or registering again.
  const again = await keys().deviceKey();
  expect(again.publicKey()).toBe(key.publicKey());
  expect(again.level).toBe('tee');
  expect(native!.generateKey).toHaveBeenCalledTimes(1);
  expect(fetchCalls).toHaveLength(1);
});

it('keeps a rejected hardware key, labelled software', async () => {
  respond(400, 'attestation security level 0');
  const key = await keys().deviceKey();
  expect(key).toMatchObject({
    level: 'software',
    claimed: 'tee',
    registration: { status: 'rejected', reason: 'attestation security level 0' },
  });
  await expectSigns(key);
  expect((await keys().deviceKey()).level).toBe('software');
  expect(fetchCalls).toHaveLength(1);
});

it('retries a registration the service never answered', async () => {
  fetchMock.mockRejectedValueOnce(new Error('network down'));
  const key = await keys().deviceKey();
  expect(key).toMatchObject({ level: 'software', registration: { status: 'pending', error: 'network down' } });

  respond(204);
  const later = await keys().deviceKey();
  expect(later.publicKey()).toBe(key.publicKey());
  expect(later).toMatchObject({ level: 'tee', registration: { status: 'registered' } });
});

it('treats a 5xx as pending, not rejected', async () => {
  respond(503);
  expect((await keys().deviceKey()).registration.status).toBe('pending');
});

it('falls back to software when key generation fails', async () => {
  native!.generateKey.mockRejectedValueOnce(new Error('keystore unavailable'));
  const key = await keys().deviceKey();
  expect(key).toMatchObject({ level: 'software', claimed: 'software', registration: { status: 'none' } });
  expect(fetchCalls).toHaveLength(0);
  await expectSigns(key);
});

it('falls back to software when the hardware signature is invalid', async () => {
  native!.sign.mockResolvedValueOnce(bytesToHex(new p256.Signature(1n, 1n).toBytes('compact')));
  const key = await keys().deviceKey();
  expect(key.claimed).toBe('software');
  expect(native!.deleteKey).toHaveBeenCalled();
});

it('falls back to software when the hardware key returns a high s', async () => {
  const sign = native!.sign.getMockImplementation()!;
  native!.sign.mockImplementationOnce(async (hex) => {
    const { r, s } = p256.Signature.fromBytes(hexToBytes(await sign(hex)), 'compact');
    return bytesToHex(new p256.Signature(r, N - s).toBytes('compact'));
  });
  const key = await keys().deviceKey();
  expect(key).toMatchObject({ level: 'software', claimed: 'software' });
  expect(native!.deleteKey).toHaveBeenCalled();
  expect(fetchCalls).toHaveLength(0);
});

it('never labels a hardware key hardware before the service accepts it', async () => {
  let answer!: (r: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
  const pending = keys().deviceKey();
  await new Promise((r) => setTimeout(r, 0));
  expect(fetchCalls).toHaveLength(1);
  answer(new Response('chain does not verify to a Google root', { status: 400 }));
  const key = await pending;
  expect(key.level).toBe('software');
  expect(key.registration).toEqual({ status: 'rejected', reason: 'chain does not verify to a Google root' });
});

it('uses software without the native module', async () => {
  native = null;
  const key = await keys().deviceKey();
  expect(key.level).toBe('software');
  await expectSigns(key);
});

it('labels a hardware key without attestation software and registers nothing', async () => {
  native!.attestation.mockRejectedValue(new Error('no attestation'));
  const key = await keys().deviceKey();
  expect(key).toMatchObject({ level: 'software', claimed: 'tee', registration: { status: 'none' } });
  expect(fetchCalls).toHaveLength(0);
});

it('keeps an existing software key until the user asks for a new one', async () => {
  native = null;
  const old = await keys().deviceKey();

  native = fakeNative();
  const k = keys();
  const loaded = await k.deviceKey();
  expect(loaded.publicKey()).toBe(old.publicKey());
  expect(native.generateKey).not.toHaveBeenCalled();

  respond(204);
  const fresh = await k.newKey();
  expect(fresh.publicKey()).not.toBe(old.publicKey());
  expect(fresh.level).toBe('tee');
  expect((await k.deviceKey()).publicKey()).toBe(fresh.publicKey());
  expect((await keys().deviceKey()).publicKey()).toBe(fresh.publicKey());
});

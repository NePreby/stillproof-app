import { _resetForTests, anchorUrl, normalizeAnchorUrl, resetAnchorUrl, setAnchorUrl } from '../anchorUrl';
import { lookupReceipts } from '../api';
import { ANCHOR_URL } from '../config';

// jest.mock is hoisted above the imports; only mock-prefixed names may be used in it.
const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));
const store = mockStore;

beforeEach(() => {
  store.clear();
  _resetForTests();
});

describe('normalizeAnchorUrl', () => {
  it.each([
    ['https://tunnel.example.com', 'https://tunnel.example.com'],
    ['  HTTPS://Anchor.Example.ORG/ ', 'https://anchor.example.org'],
    ['http://192.168.1.20:8080', 'http://192.168.1.20:8080'],
    ['http://10.0.2.2:8080//', 'http://10.0.2.2:8080'],
    ['https://example.com/anchor/', 'https://example.com/anchor'],
    ['http://[::1]:8080', 'http://[::1]:8080'],
  ])('accepts %s', (input, want) => {
    expect(normalizeAnchorUrl(input)).toBe(want);
  });

  it.each([
    [''],
    ['example.com'],
    ['ftp://example.com'],
    ['javascript:alert(1)'],
    ['https://'],
    ['https://exa mple.com'],
    ['https://example..com'],
    ['https://-example.com'],
    ['https://example.com:99999'],
    ['https://example.com/?x=1'],
    ['https://example.com/#top'],
  ])('rejects %j', (input) => {
    expect(() => normalizeAnchorUrl(input)).toThrow();
  });
});

describe('the stored URL', () => {
  it('defaults to config.ts', async () => {
    await expect(anchorUrl()).resolves.toBe(ANCHOR_URL);
  });

  it('persists a valid URL and reads it back after a restart', async () => {
    await setAnchorUrl('https://tunnel.example.com/');
    expect(store.get('stillproof.anchor-url')).toBe('https://tunnel.example.com');
    _resetForTests();
    await expect(anchorUrl()).resolves.toBe('https://tunnel.example.com');
  });

  it('does not store an invalid URL', async () => {
    await expect(setAnchorUrl('tunnel.example.com')).rejects.toThrow('http');
    expect(store.size).toBe(0);
    await expect(anchorUrl()).resolves.toBe(ANCHOR_URL);
  });

  it('ignores a bad stored value', async () => {
    store.set('stillproof.anchor-url', 'nonsense');
    await expect(anchorUrl()).resolves.toBe(ANCHOR_URL);
  });

  it('goes back to the default', async () => {
    await setAnchorUrl('https://tunnel.example.com');
    await resetAnchorUrl();
    expect(store.size).toBe(0);
    await expect(anchorUrl()).resolves.toBe(ANCHOR_URL);
  });

  it('is what the API calls', async () => {
    await setAnchorUrl('https://tunnel.example.com');
    const f = jest.fn(async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;
    await lookupReceipts('c'.repeat(64), f);
    expect(f).toHaveBeenCalledWith(`https://tunnel.example.com/v1/receipts?sha256=${'c'.repeat(64)}`);
  });
});

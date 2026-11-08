// The anchoring service URL, settable at runtime: phones reach the service
// through a tunnel whose URL changes. Stored in secure storage; defaults to config.ts.
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { ANCHOR_URL } from './config';

const STORE_KEY = 'stillproof.anchor-url';

let current = ANCHOR_URL;
let loading: Promise<string> | undefined;
const listeners = new Set<() => void>();

export class AnchorUrlError extends Error {
  name = 'AnchorUrlError';
}

/** Checks an http(s) URL with a host and returns it without trailing slashes. */
export function normalizeAnchorUrl(input: string): string {
  const s = input.trim();
  const m = /^(https?):\/\/([^/?#\s]+)(\/[^?#\s]*)?$/i.exec(s);
  if (!m) throw new AnchorUrlError('Use an http:// or https:// address, with no query or fragment.');
  const host = m[2].toLowerCase();
  const h = /^(\[[0-9a-f:.]+\]|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)(:(\d{1,5}))?$/.exec(host);
  if (!h || (h[6] !== undefined && Number(h[6]) > 65535)) throw new AnchorUrlError(`${m[2]} is not a valid host.`);
  return `${m[1].toLowerCase()}://${host}${(m[3] ?? '').replace(/\/+$/, '')}`;
}

function publish(url: string): void {
  current = url;
  listeners.forEach((l) => l());
}

/** Loads the stored URL once. Falls back to the default if storage can't be read. */
export function loadAnchorUrl(): Promise<string> {
  loading ??= SecureStore.getItemAsync(STORE_KEY)
    .then((stored) => {
      if (stored) {
        try {
          publish(normalizeAnchorUrl(stored));
        } catch {
          // A bad stored value: keep the default.
        }
      }
      return current;
    })
    .catch(() => current);
  return loading;
}

/** Validates, stores and applies a new URL. */
export async function setAnchorUrl(input: string): Promise<string> {
  const url = normalizeAnchorUrl(input);
  await SecureStore.setItemAsync(STORE_KEY, url);
  loading = Promise.resolve(url);
  publish(url);
  return url;
}

/** Forgets the stored URL and goes back to the default. */
export async function resetAnchorUrl(): Promise<string> {
  await SecureStore.deleteItemAsync(STORE_KEY);
  loading = Promise.resolve(ANCHOR_URL);
  publish(ANCHOR_URL);
  return ANCHOR_URL;
}

/** The URL API calls use: the stored one once loaded. */
export async function anchorUrl(): Promise<string> {
  return loadAnchorUrl();
}

export function useAnchorUrl(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      void loadAnchorUrl();
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** For tests: forget the cached value. */
export function _resetForTests(): void {
  current = ANCHOR_URL;
  loading = undefined;
}

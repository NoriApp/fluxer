import { normalize } from './rank.js';
import { type TrackInfo } from './types.js';

const CACHE_TTL = 10 * 60 * 1000;

const CACHE_MAX = 200;

const cache = new Map<string, { url: string; expiresAt: number }>();

export const inflight = new Map<string, Promise<string>>();

export const cacheKey = (info: TrackInfo) =>
  info.uri && !/spotify\.com/i.test(info.uri)
    ? info.uri
    : `${normalize(info.author ?? '', true)}|${normalize(info.title ?? '', true)}|${Math.round((info.duration ?? 0) / 1000)}`;

export const readCache = (key: string) => {
  const entry = cache.get(key);
  if (!entry) return '';

  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return '';
  }

  return entry.url;
};

export const writeCache = (key: string, url: string) => {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL });
};

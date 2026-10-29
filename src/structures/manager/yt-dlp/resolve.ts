import { type Candidate, type TrackInfo } from './types.js';
import { COMMON_ARGS, run } from './exec.js';
import { cookieArgs, ensureYtDlp } from './binary.js';
import { normalize, rankCandidates } from './rank.js';
import { cacheKey, inflight, readCache, writeCache } from './cache.js';

const SOURCES = ['scsearch'] as const;

const SEARCH_LIMIT = 5;

const CANDIDATES_PER_SOURCE = 3;

const SEARCH_TIMEOUT = 20000;

const EXTRACT_TIMEOUT = 25000;

const searchCandidates = async (
  binary: string,
  source: (typeof SOURCES)[number],
  query: string,
  signal?: AbortSignal,
) => {
  const stdout = await run(
    binary,
    ['-j', '--flat-playlist', '--ignore-errors', ...COMMON_ARGS, `${source}${SEARCH_LIMIT}:${query}`],
    { maxBuffer: 32 * 1024 * 1024, timeout: SEARCH_TIMEOUT, signal },
  );

  const candidates: Candidate[] = [];

  for (const line of stdout.split('\n')) {
    if (!line.trim().startsWith('{')) continue;

    try {
      const data = JSON.parse(line);
      const url = data.webpage_url ?? data.url;
      if (typeof url !== 'string' || !url.startsWith('http')) continue;

      candidates.push({
        url,
        title: String(data.title ?? ''),
        uploader: String(data.uploader ?? data.channel ?? ''),
        duration: Number(data.duration ?? 0),
      });
    } catch {}
  }

  if (!signal?.aborted) logger.info(`[Nori] ${source} found ${candidates.length} candidates.`);

  return candidates;
};

const extractStreamUrl = async (binary: string, url: string, signal?: AbortSignal) => {
  const stdout = await run(
    binary,
    [url, '-f', 'bestaudio/best', '-g', '--no-playlist', ...COMMON_ARGS, ...(await cookieArgs())],
    { maxBuffer: 4 * 1024 * 1024, timeout: EXTRACT_TIMEOUT, signal },
  );

  const first = stdout.split('\n')[0]?.trim() ?? '';

  return first.startsWith('http') ? first : '';
};

const resolveFromSource = async (
  binary: string,
  source: (typeof SOURCES)[number],
  query: string,
  info: TrackInfo,
  signal: AbortSignal,
) => {
  const candidates = await searchCandidates(binary, source, query, signal);

  for (const candidate of rankCandidates(candidates, info, CANDIDATES_PER_SOURCE)) {
    if (signal.aborted) return '';

    const url = await extractStreamUrl(binary, candidate.url, signal);
    if (url) return url;
  }

  return '';
};

const resolveUncached = async (info: TrackInfo) => {
  const started = Date.now();
  const binary = await ensureYtDlp();

  const done = (url: string) => {
    logger.info(`[Nori] Audio resolved in ${Date.now() - started}ms.`);
    return url;
  };

  if (info.uri && /^https?:\/\//i.test(info.uri) && !/spotify\.com|youtube\.com|youtu\.be/i.test(info.uri)) {
    const direct = await extractStreamUrl(binary, info.uri);
    if (direct) return done(direct);
  }

  const query = `${info.author ?? ''} ${normalize(info.title ?? '', true)}`.trim();
  const controller = new AbortController();

  const winner = await new Promise<string>((resolve) => {
    let pending = SOURCES.length;

    const settle = (url: string) => {
      if (url) {
        resolve(url);
        return;
      }

      pending -= 1;
      if (pending === 0) resolve('');
    };

    for (const source of SOURCES) {
      resolveFromSource(binary, source, query, info, controller.signal)
        .then(settle)
        .catch(() => settle(''));
    }
  });

  controller.abort();

  return winner ? done(winner) : '';
};

export const resolveAudioUrl = async (info: TrackInfo) => {
  const key = cacheKey(info);

  const cached = readCache(key);
  if (cached) return cached;

  const running = inflight.get(key);
  if (running) return running;

  const task = resolveUncached(info)
    .then((url) => {
      if (url) writeCache(key, url);
      return url;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);

  return task;
};

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { access, chmod, mkdir, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough, type Writable } from 'node:stream';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const YT_DLP_DIR = path.resolve(process.cwd(), 'bin');
const YT_DLP_PATH = path.join(YT_DLP_DIR, 'yt-dlp');
const COOKIES_PATH = path.join(YT_DLP_DIR, 'cookies.txt');
const YT_DLP_ASSET = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
const YT_DLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YT_DLP_ASSET}`;

const SOURCES = ['scsearch'] as const;
const SEARCH_LIMIT = 5;
const CANDIDATES_PER_SOURCE = 3;
const SEARCH_TIMEOUT = 20000;
const EXTRACT_TIMEOUT = 25000;
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 200;
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000;
const PCM_BYTES_PER_MS = 192;
const PACE_LEAD_MS = 12000;
const FIRST_TIMEOUT = 20000;
const STALL_TIMEOUT = 30000;
const MAX_RESUMES = 8;
const MAX_EMPTY = 3;
const END_MARGIN_MS = 500;
const EARLY_END_RATIO = 0.97;
const UNWANTED = [
  'live',
  'cover',
  'remix',
  'karaoke',
  'instrumental',
  'slowed',
  'reverb',
  'sped',
  'nightcore',
  '8d',
  'mashup',
];
const COMMON_ARGS = [
  '--no-warnings',
  '--js-runtimes',
  'node',
  '--socket-timeout',
  '10',
  '--extractor-retries',
  '1',
];

const encoders = new Map<string, ChildProcess>();
const downloads = new Map<string, AbortController>();
const cache = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string>>();

let ytDlpReady: Promise<string> | null = null;

export type TrackInfo = {
  title?: string;
  author?: string;
  duration?: number;
  uri?: string;
};

export type PcmSource = {
  stream: PassThrough;
  fedMs: () => number;
};

export type Candidate = {
  url: string;
  title: string;
  uploader: string;
  duration: number;
};

type RunOptions = {
  maxBuffer: number;
  timeout: number;
  signal?: AbortSignal;
};

const updateYtDlp = async () => {
  const { mtimeMs } = await stat(YT_DLP_PATH);
  if (Date.now() - mtimeMs < UPDATE_INTERVAL) return;

  console.log('[Nori] Updating yt-dlp...');

  await execFileAsync(YT_DLP_PATH, ['-U'], { timeout: 60000 });

  const now = new Date();
  await utimes(YT_DLP_PATH, now, now);
};

const downloadYtDlp = async () => {
  const exists = await access(YT_DLP_PATH).then(
    () => true,
    () => false,
  );

  if (exists) {
    updateYtDlp().catch((error) => {
      console.error('[Nori] yt-dlp update failed:', error?.message ?? error);
    });

    return YT_DLP_PATH;
  }

  console.log('[Nori] Downloading yt-dlp...');

  const response = await fetch(YT_DLP_URL, { redirect: 'follow' });
  if (!response.ok) throw new Error(`yt-dlp download failed: ${response.status}`);

  await mkdir(YT_DLP_DIR, { recursive: true });
  await writeFile(YT_DLP_PATH, Buffer.from(await response.arrayBuffer()));
  await chmod(YT_DLP_PATH, 0o755);

  console.log('[Nori] yt-dlp ready.');

  return YT_DLP_PATH;
};

export const ensureYtDlp = () => {
  if (!ytDlpReady) {
    ytDlpReady = downloadYtDlp().catch((error) => {
      ytDlpReady = null;
      throw error;
    });
  }

  return ytDlpReady;
};

export const diagnoseYtDlp = async () => {
  const log = (...args: unknown[]) => console.log('[Nori][diag]', ...args);
  const tail = (text: unknown, lines = 12) =>
    String(text ?? '').trim().split('\n').slice(-lines).join('\n');

  const step = async (label: string, binary: string, args: string[], timeout: number) => {
    const started = Date.now();

    try {
      const { stdout, stderr } = await execFileAsync(binary, args, {
        timeout,
        maxBuffer: 8 * 1024 * 1024,
      });

      log(`${label}: ok in ${Date.now() - started}ms, stdout ${String(stdout).length} bytes`);
      log(`${label} stdout: ${tail(stdout, 3).slice(0, 400)}`);
      if (String(stderr).trim()) log(`${label} stderr:\n${tail(stderr)}`);
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; killed?: boolean; code?: unknown; message?: string };

      log(
        `${label}: FAILED in ${Date.now() - started}ms killed=${failure.killed ?? false} code=${String(failure.code)} msg=${failure.message?.split('\n')[0]}`,
      );
      if (String(failure.stderr ?? '').trim()) log(`${label} stderr:\n${tail(failure.stderr)}`);
      if (String(failure.stdout ?? '').trim()) log(`${label} stdout:\n${tail(failure.stdout, 3).slice(0, 400)}`);
    }
  };

  try {
    const binary = await ensureYtDlp();

    log(`arch=${process.arch} node=${process.version} execPath=${process.execPath} bin=${binary}`);

    await step('yt-dlp --version', binary, ['--version'], 30000);
    await step('ffmpeg -version', 'ffmpeg', ['-version'], 10000);
    await step(
      'ytsearch',
      binary,
      ['-v', '--no-playlist', '-j', '--flat-playlist', ...COMMON_ARGS, 'ytsearch1:pumapjl mar'],
      45000,
    );
    await step(
      'scsearch',
      binary,
      ['-v', '--no-playlist', '-j', '--flat-playlist', ...COMMON_ARGS, 'scsearch1:pumapjl mar'],
      45000,
    );
    await step(
      'ytsearch (sem js-runtimes)',
      binary,
      ['-v', '--no-playlist', '-j', '--flat-playlist', '--no-warnings', 'ytsearch1:pumapjl mar'],
      45000,
    );
  } catch (error) {
    log('setup failed:', (error as Error)?.message ?? error);
  }

  log('done');
};

const normalize = (value: string, strip = false) =>
  (strip ? value.replace(/\(.*?\)|\[.*?\]/g, ' ') : value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokenize = (value: string, strip = false) =>
  new Set(
    normalize(value, strip)
      .split(' ')
      .filter((token) => token.length > 1),
  );

const overlap = (needle: Set<string>, haystack: Set<string>) => {
  if (!needle.size) return 0;

  let hits = 0;
  for (const token of needle) if (haystack.has(token)) hits++;

  return hits / needle.size;
};

const cookieArgs = async () =>
  access(COOKIES_PATH).then(
    () => ['--cookies', COOKIES_PATH],
    () => [],
  );

const run = async (binary: string, args: string[], options: RunOptions) => {
  try {
    const { stdout } = await execFileAsync(binary, args, options);
    return String(stdout);
  } catch (error) {
    if (options.signal?.aborted) return '';

    const failure = error as { stdout?: string; stderr?: string; killed?: boolean };
    const reason = String(failure.stderr ?? '').trim().split('\n').slice(-2).join(' ');

    console.error(
      `[Nori] yt-dlp failed${failure.killed ? ' (timeout)' : ''}: ${reason || 'no output'}`,
    );

    return String(failure.stdout ?? '');
  }
};

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

  if (!signal?.aborted) console.log(`[Nori] ${source} found ${candidates.length} candidates.`);

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

export const rankCandidates = <T extends Candidate>(candidates: T[], info: TrackInfo, limit: number): T[] => {
  const titleTokens = tokenize(info.title ?? '', true);
  const authorTokens = tokenize(info.author ?? '', true);
  const originalTokens = tokenize(info.title ?? '');
  const targetSeconds = info.duration ? info.duration / 1000 : 0;

  return candidates
    .filter(
      (candidate) =>
        !(targetSeconds && candidate.duration && candidate.duration < targetSeconds * 0.7),
    )
    .map((candidate) => {
      const candidateTokens = tokenize(candidate.title);
      const haystack = tokenize(`${candidate.title} ${candidate.uploader}`);

      let score = overlap(titleTokens, haystack) * 3 + overlap(authorTokens, haystack) * 2;

      for (const word of UNWANTED) {
        if (candidateTokens.has(word) && !originalTokens.has(word)) score -= 2;
      }

      if (tokenize(candidate.uploader).has('topic')) score += 1.5;

      if (targetSeconds && candidate.duration) {
        const diff = Math.abs(candidate.duration - targetSeconds);
        if (diff <= 4) score += 3;
        else if (diff <= 12) score += 1;
        else if (diff > 30) score -= 4;
      }

      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.candidate);
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

const cacheKey = (info: TrackInfo) =>
  info.uri && !/spotify\.com/i.test(info.uri)
    ? info.uri
    : `${normalize(info.author ?? '', true)}|${normalize(info.title ?? '', true)}|${Math.round((info.duration ?? 0) / 1000)}`;

const readCache = (key: string) => {
  const entry = cache.get(key);
  if (!entry) return '';

  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return '';
  }

  return entry.url;
};

const writeCache = (key: string, url: string) => {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL });
};

const resolveUncached = async (info: TrackInfo) => {
  const started = Date.now();
  const binary = await ensureYtDlp();

  const done = (url: string) => {
    console.log(`[Nori] Audio resolved in ${Date.now() - started}ms.`);
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

export const stopEncoder = (guildId: string) => {
  const download = downloads.get(guildId);
  if (download) {
    download.abort();
    downloads.delete(guildId);
  }

  const encoder = encoders.get(guildId);
  if (!encoder) return;

  encoder.kill('SIGKILL');
  encoders.delete(guildId);
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const writeChunk = async (sink: Writable, chunk: Buffer, signal: AbortSignal) => {
  if (signal.aborted || sink.destroyed || !sink.writable) return false;
  if (sink.write(chunk)) return true;

  await new Promise<void>((resolve) => {
    const finish = () => {
      sink.off('drain', finish);
      sink.off('close', finish);
      signal.removeEventListener('abort', finish);
      resolve();
    };

    sink.once('drain', finish);
    sink.once('close', finish);
    signal.addEventListener('abort', finish, { once: true });
  });

  return !signal.aborted && !sink.destroyed;
};

class PcmFeed {
  bytes = 0;
  private carry: Buffer = Buffer.alloc(0);
  private announced = false;
  private startedAt = 0;
  private readonly sink: Writable;
  private readonly signal: AbortSignal;
  private readonly onFirst: () => void;
  private readonly baseMs: number;

  constructor(sink: Writable, signal: AbortSignal, onFirst: () => void, startMs = 0) {
    this.sink = sink;
    this.signal = signal;
    this.onFirst = onFirst;
    this.baseMs = startMs;
    this.bytes = startMs * PCM_BYTES_PER_MS;
  }

  get ms() {
    return Math.floor(this.bytes / PCM_BYTES_PER_MS);
  }

  reset() {
    this.carry = Buffer.alloc(0);
  }

  async push(part: Uint8Array) {
    const incoming = Buffer.from(part.buffer, part.byteOffset, part.byteLength);
    const data = this.carry.length > 0 ? Buffer.concat([this.carry, incoming]) : incoming;
    const usable = data.length - (data.length % 4);

    this.carry = Buffer.from(data.subarray(usable));
    if (usable === 0) return true;

    this.bytes += usable;

    if (!this.announced) {
      this.announced = true;
      this.startedAt = Date.now();
      this.onFirst();
    }

    if (!(await writeChunk(this.sink, data.subarray(0, usable), this.signal))) return false;

    return this.pace();
  }

  private async pace() {
    const ahead = this.ms - this.baseMs - (Date.now() - this.startedAt) - PACE_LEAD_MS;
    if (ahead <= 0) return true;

    await new Promise<void>((resolve) => {
      let timer: NodeJS.Timeout | null = null;

      const done = () => {
        if (timer) clearTimeout(timer);
        this.signal.removeEventListener('abort', done);
        resolve();
      };

      timer = setTimeout(done, ahead);
      this.signal.addEventListener('abort', done, { once: true });
    });

    return !this.signal.aborted && !this.sink.destroyed;
  }
}

const createGate = (timeoutMs: number) => {
  let open!: () => void;
  let fail!: (error: Error) => void;

  const promise = new Promise<void>((resolve, reject) => {
    open = resolve;
    fail = reject;
  });

  const timer = setTimeout(() => fail(new Error('no audio before timeout')), timeoutMs);
  promise.then(
    () => clearTimeout(timer),
    () => clearTimeout(timer),
  );

  return { promise, open, fail };
};

const logEarlyEnd = (label: string, feed: PcmFeed, expectedMs: number, signal: AbortSignal) => {
  if (signal.aborted || expectedMs <= 0 || feed.ms >= expectedMs * EARLY_END_RATIO) return;
  console.error(`[Nori] ${label} ended early at ${feed.ms}ms of ${expectedMs}ms.`);
};

const feedLoadstream = async (
  sink: Writable,
  feed: PcmFeed,
  url: string,
  headers: Record<string, string> | undefined,
  expectedMs: number,
  signal: AbortSignal,
  splice = false,
) => {
  let empty = 0;
  let resumes = 0;
  const origin = feed.ms;

  while (!signal.aborted && !sink.destroyed) {
    const cursor = feed.ms;
    if (expectedMs > 0 && cursor >= expectedMs - END_MARGIN_MS) break;

    const before = feed.bytes;
    const attempt = new AbortController();
    const abortAttempt = () => attempt.abort();
    let stall: NodeJS.Timeout | null = null;

    const arm = () => {
      if (stall) clearTimeout(stall);
      stall = setTimeout(abortAttempt, STALL_TIMEOUT);
    };

    signal.addEventListener('abort', abortAttempt, { once: true });
    feed.reset();

    try {
      arm();

      const requested = Date.now();
      console.log(`[Nori][debug][loadstream] request at ${cursor}ms`);

      const response = await fetch(cursor > 0 ? `${url}&position=${cursor}` : url, {
        headers,
        signal: attempt.signal,
      });

      console.log(
        `[Nori][debug][loadstream] headers after ${Date.now() - requested}ms status=${response.status} type=${response.headers.get('content-type')} length=${response.headers.get('content-length')}`,
      );

      if (!response.ok || !response.body) {
        const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
        throw new Error(`loadstream status ${response.status} ${detail}`.trim());
      }

      let firstPart = true;

      for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
        if (firstPart) {
          firstPart = false;
          console.log(
            `[Nori][debug][loadstream] first body chunk after ${Date.now() - requested}ms (${part.byteLength} bytes)`,
          );
        }

        arm();
        if (!(await feed.push(part))) break;
      }
    } catch (error) {
      if (!signal.aborted) {
        console.error(`[Nori] loadstream at ${cursor}ms failed:`, (error as Error)?.message ?? error);
      }
    } finally {
      if (stall) clearTimeout(stall);
      signal.removeEventListener('abort', abortAttempt);
      attempt.abort();
    }

    if (signal.aborted) break;
    if (expectedMs <= 0 && feed.bytes > before) break;
    if (expectedMs > 0 && feed.ms >= expectedMs - END_MARGIN_MS) break;

    // Audio already went out: don't splice with ?position= (node seeks imprecisely,
    // which repeats/skips audio). End early so playTrack falls back from feed.ms.
    // (splice=true is the last-resort mode used when every other source failed.)
    if (!splice && feed.ms > origin) break;

    empty = feed.bytes > before ? 0 : empty + 1;
    if (empty >= MAX_EMPTY) break;

    resumes += 1;
    if (resumes > MAX_RESUMES) break;

    console.log(`[Nori] loadstream retrying at ${feed.ms}ms.`);
    await sleep(500);
  }

  logEarlyEnd('loadstream', feed, expectedMs, signal);

  if (!sink.destroyed) sink.end();
};

export const createPcmStream = async (
  guildId: string,
  url: string,
  options: {
    headers?: Record<string, string>;
    expectedMs?: number;
    startMs?: number;
    splice?: boolean;
    firstTimeout?: number;
  } = {},
): Promise<PcmSource> => {
  stopEncoder(guildId);

  const { headers, expectedMs = 0, startMs = 0, splice = false, firstTimeout = FIRST_TIMEOUT } = options;
  const controller = new AbortController();
  downloads.set(guildId, controller);

  const release = () => {
    controller.abort();
    if (downloads.get(guildId) === controller) downloads.delete(guildId);
  };

  const pcm = new PassThrough({ highWaterMark: PCM_BYTES_PER_MS * 1000 });
  pcm.on('error', () => null);
  pcm.once('close', release);

  const gate = createGate(firstTimeout);
  const feed = new PcmFeed(pcm, controller.signal, gate.open, startMs);
  const started = Date.now();

  feedLoadstream(pcm, feed, url, headers, expectedMs, controller.signal, splice)
    .then(() => gate.fail(new Error('loadstream returned no audio')))
    .catch(() => gate.fail(new Error('loadstream failed')));

  try {
    await gate.promise;
  } catch (error) {
    release();
    pcm.destroy();
    throw error;
  }

  console.log(`[Nori] loadstream first chunk in ${Date.now() - started}ms.`);

  return { stream: pcm, fedMs: () => feed.ms };
};

const runFfmpeg = (
  guildId: string,
  url: string,
  startMs: number,
  feed: PcmFeed,
  signal: AbortSignal,
) =>
  new Promise<void>((resolve) => {
    const args = [
      '-loglevel',
      'error',
      '-nostdin',
      '-reconnect',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_delay_max',
      '5',
    ];

    if (startMs > 0) args.push('-ss', (startMs / 1000).toFixed(3));

    args.push('-i', url, '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1');

    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    encoders.set(guildId, child);

    const kill = () => child.kill('SIGKILL');
    let stall: NodeJS.Timeout | null = null;

    const arm = () => {
      if (stall) clearTimeout(stall);
      stall = setTimeout(kill, STALL_TIMEOUT);
    };

    signal.addEventListener('abort', kill, { once: true });
    arm();

    child.stderr?.on('data', (chunk) => {
      console.error('[Nori] ffmpeg:', String(chunk).trim());
    });

    const pump = (async () => {
      for await (const part of child.stdout as AsyncIterable<Uint8Array>) {
        arm();

        if (!(await feed.push(part))) {
          kill();
          break;
        }
      }
    })().catch(() => null);

    const closed = new Promise<void>((done) => {
      child.once('close', () => done());
      child.once('error', (error) => {
        console.error('[Nori] ffmpeg failed to start:', error.message);
        done();
      });
    });

    Promise.all([pump, closed]).then(() => {
      if (stall) clearTimeout(stall);
      signal.removeEventListener('abort', kill);
      if (encoders.get(guildId) === child) encoders.delete(guildId);
      resolve();
    });
  });

const feedTranscode = async (
  guildId: string,
  sink: Writable,
  feed: PcmFeed,
  url: string,
  expectedMs: number,
  signal: AbortSignal,
) => {
  let empty = 0;
  let resumes = 0;

  while (!signal.aborted && !sink.destroyed) {
    const cursor = feed.ms;
    if (expectedMs > 0 && cursor >= expectedMs - END_MARGIN_MS) break;

    const before = feed.bytes;
    feed.reset();

    await runFfmpeg(guildId, url, cursor, feed, signal);

    if (signal.aborted) break;
    if (feed.bytes === before) break;
    if (expectedMs <= 0) break;
    if (feed.ms >= expectedMs - END_MARGIN_MS) break;

    empty = feed.bytes > before ? 0 : empty + 1;
    if (empty >= MAX_EMPTY) break;

    resumes += 1;
    if (resumes > MAX_RESUMES) break;

    console.log(`[Nori] ffmpeg resuming at ${feed.ms}ms.`);
    await sleep(500);
  }

  logEarlyEnd('ffmpeg', feed, expectedMs, signal);

  if (!sink.destroyed) sink.end();
};

export const createTranscoder = async (
  guildId: string,
  url: string,
  expectedMs = 0,
  startMs = 0,
): Promise<PcmSource> => {
  stopEncoder(guildId);

  const controller = new AbortController();
  downloads.set(guildId, controller);

  const release = () => {
    controller.abort();
    if (downloads.get(guildId) === controller) downloads.delete(guildId);
  };

  const pcm = new PassThrough({ highWaterMark: PCM_BYTES_PER_MS * 1000 });
  pcm.on('error', () => null);
  pcm.once('close', release);

  const gate = createGate(FIRST_TIMEOUT);
  const feed = new PcmFeed(pcm, controller.signal, gate.open, startMs);
  const started = Date.now();

  feedTranscode(guildId, pcm, feed, url, expectedMs, controller.signal)
    .then(() => gate.fail(new Error('ffmpeg returned no audio')))
    .catch(() => gate.fail(new Error('ffmpeg failed')));

  try {
    await gate.promise;
  } catch (error) {
    release();
    pcm.destroy();
    throw error;
  }

  console.log(`[Nori] ffmpeg first chunk in ${Date.now() - started}ms.`);

  return { stream: pcm, fedMs: () => feed.ms };
};

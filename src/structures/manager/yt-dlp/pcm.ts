import { type Writable, PassThrough } from 'node:stream';
import { type PcmSource } from './types.js';
import { downloads, stopEncoder } from './encoders.js';

export const PCM_BYTES_PER_MS = 192;

const PACE_LEAD_MS = 12000;

export const FIRST_TIMEOUT = 20000;

export const STALL_TIMEOUT = 30000;

export const MAX_RESUMES = 8;

export const MAX_EMPTY = 3;

export const END_MARGIN_MS = 500;

const EARLY_END_RATIO = 0.97;

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

export class PcmFeed {
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

export const createGate = (timeoutMs: number) => {
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

export const logEarlyEnd = (label: string, feed: PcmFeed, expectedMs: number, signal: AbortSignal) => {
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
    let blocked = false;

    const arm = () => {
      if (stall) clearTimeout(stall);
      stall = setTimeout(abortAttempt, STALL_TIMEOUT);
    };

    signal.addEventListener('abort', abortAttempt, { once: true });
    feed.reset();

    try {
      arm();

      const response = await fetch(cursor > 0 ? `${url}&position=${cursor}` : url, {
        headers,
        signal: attempt.signal,
      });

      if (!response.ok || !response.body) {
        const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
        throw new Error(`loadstream status ${response.status} ${detail}`.trim());
      }

      for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
        arm();
        if (!(await feed.push(part))) break;
      }
    } catch (error) {
      const message = (error as Error)?.message ?? String(error);
      blocked = /HTTP 403|status 403/.test(message);

      if (!signal.aborted) {
        console.error(`[Nori] loadstream at ${cursor}ms failed:`, message);
      }
    } finally {
      if (stall) clearTimeout(stall);
      signal.removeEventListener('abort', abortAttempt);
      attempt.abort();
    }

    if (signal.aborted) break;
    if (blocked && feed.bytes === before) break;
    if (expectedMs <= 0 && feed.bytes > before) break;
    if (expectedMs > 0 && feed.ms >= expectedMs - END_MARGIN_MS) break;

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

import { spawn } from 'node:child_process';
import { type Writable, PassThrough } from 'node:stream';
import {
  END_MARGIN_MS,
  FIRST_TIMEOUT,
  MAX_EMPTY,
  MAX_RESUMES,
  PCM_BYTES_PER_MS,
  PcmFeed,
  STALL_TIMEOUT,
  createGate,
  logEarlyEnd,
  sleep,
} from './pcm.js';
import { downloads, encoders, stopEncoder } from './encoders.js';
import { type PcmSource } from './types.js';

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

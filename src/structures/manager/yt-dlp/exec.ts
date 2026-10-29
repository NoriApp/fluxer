import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const execFileAsync = promisify(execFile);

export const COMMON_ARGS = [
  '--no-warnings',
  '--js-runtimes',
  'node',
  '--socket-timeout',
  '10',
  '--extractor-retries',
  '1',
];

type RunOptions = {
  maxBuffer: number;
  timeout: number;
  signal?: AbortSignal;
};

export const run = async (binary: string, args: string[], options: RunOptions) => {
  try {
    const { stdout } = await execFileAsync(binary, args, options);
    return String(stdout);
  } catch (error) {
    if (options.signal?.aborted) return '';

    const failure = error as { stdout?: string; stderr?: string; killed?: boolean };
    const reason = String(failure.stderr ?? '').trim().split('\n').slice(-2).join(' ');

    logger.error(
      `[Nori] yt-dlp failed${failure.killed ? ' (timeout)' : ''}: ${reason || 'no output'}`,
    );

    return String(failure.stdout ?? '');
  }
};

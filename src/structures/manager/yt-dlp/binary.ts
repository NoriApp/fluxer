import path from 'node:path';
import { utimes, stat, access, writeFile, chmod, mkdir } from 'node:fs/promises';
import { execFileAsync } from './exec.js';

const YT_DLP_DIR = path.resolve(process.cwd(), 'bin');

const YT_DLP_PATH = path.join(YT_DLP_DIR, 'yt-dlp');

const COOKIES_PATH = path.join(YT_DLP_DIR, 'cookies.txt');

const YT_DLP_ASSET = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';

const YT_DLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YT_DLP_ASSET}`;

const UPDATE_INTERVAL = 24 * 60 * 60 * 1000;

let ytDlpReady: Promise<string> | null = null;

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

export const cookieArgs = async () =>
  access(COOKIES_PATH).then(
    () => ['--cookies', COOKIES_PATH],
    () => [],
  );

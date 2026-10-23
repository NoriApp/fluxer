import { type ChildProcess } from 'node:child_process';

export const encoders = new Map<string, ChildProcess>();

export const downloads = new Map<string, AbortController>();

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

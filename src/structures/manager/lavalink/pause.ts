import { type GuildQueue } from './types.js';

export const releasePause = (queue: GuildQueue, replay: boolean) => {
  if (!queue.paused) return false;

  queue.paused = false;

  const resume = queue.resume;
  queue.resume = null;
  resume?.(replay);

  return true;
};

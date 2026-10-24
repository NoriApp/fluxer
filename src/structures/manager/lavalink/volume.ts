import { type GuildQueue } from './types.js';

export const MIN_VOLUME = 0;
export const MAX_VOLUME = 200;

type VolumeControl = { setVolume?: (percent: number) => void };

export const applyVolume = (queue: GuildQueue) => {
  (queue.connection as unknown as VolumeControl | null)?.setVolume?.(queue.volume);
};

export const setQueueVolume = (queue: GuildQueue, volume: number) => {
  queue.volume = volume;
  applyVolume(queue);
};

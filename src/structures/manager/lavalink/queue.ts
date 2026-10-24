import { voiceManager } from '#base';
import { queues } from './state.js';
import { clearAlone, clearIdle, watchAlone } from './idle.js';
import { type EnqueueOptions } from './types.js';
import { run } from './player.js';

export const getQueue = (guildId: string) => queues.get(guildId) ?? null;

export const enqueue = ({ guildId, voiceChannelId, textChannelId, tracks }: EnqueueOptions) => {
  let queue = queues.get(guildId);

  if (!queue) {

    queue = {
      guildId,
      voiceChannelId,
      textChannelId,
      tracks: [],
      current: null,
      busy: false,
      ownerId: tracks[0]?.requester.id ?? '',
      idleTimer: null,
      aloneTimer: null,
      aloneSeen: false,
      aloneWatcher: null,
      skip: null,
      connection: null,
    };

    queues.set(guildId, queue);
    watchAlone(queue);
  }

  queue.voiceChannelId = voiceChannelId;
  queue.textChannelId = textChannelId;

  clearIdle(queue);
  queue.tracks.push(...tracks);

  run(queue).catch((error) => {
    console.error('[Nori] queue run crashed:', (error as Error)?.message ?? error);
    queue.busy = false;
  });
};

export const skipTrack = (guildId: string) => {
  const queue = queues.get(guildId);

  if (!queue?.skip) {
    return false;
  }

  queue.skip();
  return true;
};

export const stopQueue = (guildId: string) => {
  const queue = queues.get(guildId);

  if (!queue) {
    return false;
  }

  queue.tracks.length = 0;
  queue.skip?.();
  return true;
};

export const destroyQueue = (guildId: string) => {
  const queue = queues.get(guildId);

  if (!queue) {
    return false;
  }

  queues.delete(guildId);
  clearIdle(queue);
  clearAlone(queue);

  queue.tracks.length = 0;
  queue.skip?.();
  queue.current = null;
  queue.connection = null;

  Promise.resolve(voiceManager.leave(guildId)).catch(() => null);

  return true;
};

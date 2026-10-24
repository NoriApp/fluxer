import config from '#nori/config/default.config.js';
import { voiceManager } from '#base';
import { queues } from './state.js';
import { clearAlone, clearIdle, watchAlone } from './idle.js';
import { releasePause } from './pause.js';
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
      volume: config.music.defaultVolume,
      busy: false,
      ownerId: tracks[0]?.requester.id ?? '',
      idleTimer: null,
      aloneTimer: null,
      aloneSeen: false,
      aloneWatcher: null,
      paused: false,
      position: 0,
      playhead: null,
      resume: null,
      resumeSignal: null,
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

  if (queue?.paused) {
    releasePause(queue, false);
    return true;
  }

  if (!queue?.skip) {
    return false;
  }

  queue.skip();
  return true;
};

export const pauseQueue = (guildId: string) => {
  const queue = queues.get(guildId);

  if (!queue?.current || queue.paused || !queue.skip) {
    return false;
  }

  queue.position = queue.playhead?.() ?? queue.position;
  queue.paused = true;
  queue.resumeSignal = new Promise<boolean>((resolve) => {
    queue.resume = resolve;
  });
  queue.skip();

  return true;
};

export const resumeQueue = (guildId: string) => {
  const queue = queues.get(guildId);

  if (!queue?.paused) {
    return false;
  }

  return releasePause(queue, true);
};

export const stopQueue = (guildId: string) => {
  const queue = queues.get(guildId);

  if (!queue) {
    return false;
  }

  queue.tracks.length = 0;
  releasePause(queue, false);
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
  releasePause(queue, false);
  queue.skip?.();
  queue.current = null;
  queue.connection = null;

  Promise.resolve(voiceManager.leave(guildId)).catch(() => null);

  return true;
};

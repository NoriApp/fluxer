import { EmbedBuilder } from '@fluxerjs/core';
import { client, voiceManager } from '#base';
import config from '#nori/config/default.config.js';
import { getLanguage, type Language } from '#nori/i18n/index.js';
import { type GuildQueue } from './types.js';
import { queues } from './state.js';
import { releasePause } from './pause.js';

const ALONE_CHECK_MS = 5000;

export const notify = async (channelId: string, description: string) => {
  const embed = new EmbedBuilder().setColor(config.color).setDescription(description);
  await client.channels.send(channelId, { embeds: [embed] }).catch(() => null);
};

const announce = async (queue: GuildQueue, pick: (language: Language, time: string) => string) => {
  const language = await getLanguage(queue.ownerId);
  const seconds = Math.round(config.music.disconnectTime / 1000);
  const time = language.general.music.player.duration(Math.floor(seconds / 60), seconds % 60);

  await notify(queue.textChannelId, pick(language, time));
};

export const clearIdle = (queue: GuildQueue) => {
  if (!queue.idleTimer) return;
  clearTimeout(queue.idleTimer);
  queue.idleTimer = null;
};

export const clearAlone = (queue: GuildQueue) => {
  if (queue.aloneWatcher) {
    clearInterval(queue.aloneWatcher);
    queue.aloneWatcher = null;
  }

  if (queue.aloneTimer) {
    clearTimeout(queue.aloneTimer);
    queue.aloneTimer = null;
  }
};

const closeQueue = (queue: GuildQueue) => {
  if (queues.get(queue.guildId) !== queue) return;

  queues.delete(queue.guildId);
  clearIdle(queue);
  clearAlone(queue);

  queue.tracks.length = 0;
  releasePause(queue, false);
  queue.skip?.();
  queue.current = null;
  queue.connection = null;

  Promise.resolve(voiceManager.leave(queue.guildId)).catch(() => null);
};

export const scheduleIdle = (queue: GuildQueue) => {
  if (queues.get(queue.guildId) !== queue) return;

  clearIdle(queue);

  queue.idleTimer = setTimeout(() => {
    announce(queue, (language, time) => language.general.music.player.idleLeft(time)).catch(() => null);
    closeQueue(queue);
  }, config.music.disconnectTime);

  announce(queue, (language, time) => language.general.music.player.queueEnded(time)).catch(() => null);
};

type VoiceChange = { userId: string; channelId: string | null };

const countListeners = (queue: GuildQueue, change?: VoiceChange) => {
  const members = new Map(voiceManager.voiceStates.get(queue.guildId) ?? []);
  const botId = client.user?.id;

  if (change) members.set(change.userId, change.channelId);

  let count = 0;

  for (const [userId, channelId] of members) {
    if (userId !== botId && channelId === queue.voiceChannelId) count++;
  }

  return count;
};

const evaluate = (queue: GuildQueue, change?: VoiceChange) => {
  if (queues.get(queue.guildId) !== queue) {
    clearAlone(queue);
    return;
  }

  if (!queue.connection) return;

  if (countListeners(queue, change) > 0) {
    queue.aloneSeen = true;

    if (queue.aloneTimer) {
      clearTimeout(queue.aloneTimer);
      queue.aloneTimer = null;
    }

    return;
  }

  if (!queue.aloneSeen || queue.aloneTimer) return;

  queue.aloneTimer = setTimeout(() => closeQueue(queue), config.music.disconnectTime);

  announce(queue, (language, time) => language.general.music.player.alone(time)).catch(() => null);
};

export const handleBotRemoved = (guildId: string) => {
  const queue = queues.get(guildId);

  if (!queue?.connection) return;

  announce(queue, (language) => language.general.music.player.kicked).catch(() => null);
  closeQueue(queue);
};

export const refreshAlone = (guildId: string, change?: VoiceChange) => {
  const queue = queues.get(guildId);

  if (queue) evaluate(queue, change);
};

export const watchAlone = (queue: GuildQueue) => {
  if (queue.aloneWatcher) return;

  queue.aloneWatcher = setInterval(() => evaluate(queue), ALONE_CHECK_MS);
};

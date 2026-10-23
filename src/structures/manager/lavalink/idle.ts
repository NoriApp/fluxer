import { EmbedBuilder } from '@fluxerjs/core';
import { client, voiceManager } from '#base';
import config from '#nori/config/default.config.js';
import { type GuildQueue } from './types.js';
import { queues } from './state.js';

export const notify = async (channelId: string, description: string) => {
  const embed = new EmbedBuilder().setColor(config.color).setDescription(description);
  await client.channels.send(channelId, { embeds: [embed] }).catch(() => null);
};

export const clearIdle = (queue: GuildQueue) => {
  if (!queue.idleTimer) return;
  clearTimeout(queue.idleTimer);
  queue.idleTimer = null;
};

export const scheduleIdle = (queue: GuildQueue) => {
  if (queues.get(queue.guildId) !== queue) return;

  clearIdle(queue);

  queue.idleTimer = setTimeout(() => {
    if (queues.get(queue.guildId) !== queue) return;

    queues.delete(queue.guildId);
    queue.connection = null;
    voiceManager.leave(queue.guildId);
  }, config.music.disconnectTime);
};

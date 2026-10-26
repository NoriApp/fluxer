import { EmbedBuilder } from '@fluxerjs/core';
import { client } from '#base';
import config from '#nori/config/default.config.js';

const DEDUPE_MS = 60000;
const MAX_KEYS = 200;

const recent = new Map<string, number>();

type ReportContext = {
  guildId?: string;
  channelId?: string;
};

export const reportError = async (source: string, error: unknown, context: ReportContext = {}) => {
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${context.guildId ?? ''}:${source}`;
  const now = Date.now();

  if ((recent.get(key) ?? 0) + DEDUPE_MS > now) return;

  if (recent.size >= MAX_KEYS) recent.clear();
  recent.set(key, now);

  const guild = context.guildId ? await client.guilds.fetch(context.guildId).catch(() => null) : null;

  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle('Player Error')
    .addFields(
      { name: 'Source', value: `\`${source}\``, inline: true },
      { name: 'Guild', value: `\`${context.guildId ?? 'unknown'}\``, inline: true },
      { name: 'Channel', value: context.channelId ? `<#${context.channelId}>` : '`unknown`', inline: true },
      { name: 'Error', value: `\`\`\`${err.message.slice(0, 1000)}\`\`\`` },
      { name: 'Log', value: `\`\`\`${(err.stack ?? 'No stack trace available').slice(0, 1000)}\`\`\`` },
    )
    .setTimestamp();

  if (guild) embed.setThumbnail(guild.iconURL());

  await client.channels.send(config.channels.errorsId, { embeds: [embed] }).catch(() => null);
};

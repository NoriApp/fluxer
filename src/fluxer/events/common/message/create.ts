import { EmbedBuilder, Events, type Message } from '@fluxerjs/core';
import { client, commands, createEvent, voiceManager } from '#base';
import config from '#nori/config/default.config.js';
import { db } from '#nori/db/index.js';
import { resolveLanguage } from '#nori/i18n/index.js';

const isBotMention = (content: string, botId?: string) =>
  !!botId && (content === `<@${botId}>` || content === `<@!${botId}>`);

createEvent({
  name: 'Message Create',
  event: Events.MessageCreate,
  run: async (message: Message) => {
    if (message.author.bot || !message.guildId) return;

    const guildId = message.guildId;

    const [guild, user] = (await Promise.all([
      db.guild.findOne({ guildId }).select('prefix').lean(),
      db.user.findOne({ userId: message.author.id }).select('language').lean(),
    ])) as [{ prefix?: string } | null, { language?: string } | null];

    const prefix = guild?.prefix || config.prefix;

    if (isBotMention(message.content.trim(), client.user?.id)) {
      const t = resolveLanguage(user?.language ?? 'en-US');
      await message.reply(t.general.mention(prefix)).catch(() => null);
      return;
    }

    if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return;

    const [rawName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = commands.get((rawName ?? '').toLowerCase());
    if (!command) return;

    const t = resolveLanguage(user?.language ?? config.locale);

    try {
      await command.run({
        client,
        message,
        user: message.author,
        guildId,
        channelId: message.channelId,
        args,
        prefix,
        commands,
        voiceManager,
        reply: message.reply.bind(message),
      });
    } catch (error) {
      await message.reply(t.general.error).catch(() => null);

      const err = error instanceof Error ? error : new Error(String(error));
      const commandGuild = await client.guilds.fetch(guildId).catch(() => null);

      const errorEmbed = new EmbedBuilder()
        .setColor(config.color)
        .setTitle('Command Error')
        .addFields(
          { name: 'Command', value: `\`${command.name}\``, inline: true },
          { name: 'Guild', value: `\`${guildId}\``, inline: true },
          { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
          { name: 'Error', value: `\`\`\`${err.message.slice(0, 1000)}\`\`\`` },
          { name: 'Log', value: `\`\`\`${(err.stack ?? 'No stack trace available').slice(0, 1000)}\`\`\`` },
        )
        .setTimestamp();

      if (commandGuild) errorEmbed.setThumbnail(commandGuild.iconURL());

      await client.channels.send(config.channels.errorsId, { embeds: [errorEmbed] }).catch(() => null);
    }
  },
});

import { EmbedBuilder, Events, type Guild } from '@fluxerjs/core';
import { client, createEvent } from '#base';
import config from '#nori/config/default.config.js';
import { db } from '#nori/db/index.js';
import { markFreshGuild } from '#nori/structures/functions/client/info/claim.js';

const STARTUP_GRACE = 15_000;
const MAX_ATTEMPTS = 10;
const TEXT_CHANNEL_TYPES = new Set([0, 5]);

const isNewGuild = async (guildId: string) => {
  const previous = await db.guild
    .findOneAndUpdate(
      { guildId },
      { $setOnInsert: { guildId } },
      { upsert: true, returnDocument: 'before', setDefaultsOnInsert: true },
    )
    .lean();

  return previous === null;
};

const thanksEmbed = (guild: Guild) =>
  new EmbedBuilder()
    .setColor(config.color)
    .setTitle('Thanks for adding Nori!')
    .setDescription(
      [
        `Hi! I'm **Nori**, a music bot. Thanks for adding me to **${guild.name}**.`,
        '',
        `Use \`${config.prefix}play <song or link>\` to start listening and \`${config.prefix}help\` to see all my commands.`,
        `Use \`${config.prefix}language\` to change your language.`,
        '',
        `[Website](${config.links.website})`,
      ].join('\n'),
    );

const sendThanks = async (guild: Guild) => {
  const channels = [...guild.channels.values()]
    .filter(
      (channel) =>
        TEXT_CHANNEL_TYPES.has(channel.type as number) &&
        channel.isTextBased(),
    )
    .sort(
      (a, b) =>
        Number((a as { position?: number }).position ?? 0) -
        Number((b as { position?: number }).position ?? 0),
    )
    .slice(0, MAX_ATTEMPTS);

  for (const channel of channels) {
    try {
      const textChannel = channel as unknown as {
        id: string;
        send: (options: { embeds: EmbedBuilder[] }) => Promise<unknown>;
      };

      await textChannel.send({ embeds: [thanksEmbed(guild)] });

      return textChannel.id;
    } catch {}
  }

  return null;
};

const sendLog = async (guild: Guild) => {
  const info = guild as unknown as {
    memberCount?: number;
    ownerId?: string;
  };

  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle('Joined a new server')
    .addFields(
      { name: 'Server', value: guild.name, inline: true },
      { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
      {
        name: 'Members',
        value: String(info.memberCount ?? 'Unknown'),
        inline: true,
      },
      {
        name: 'Owner ID',
        value: info.ownerId ? `\`${info.ownerId}\`` : 'Unknown',
        inline: true,
      },
    )
    .setTimestamp();

  const icon = guild.iconURL();

  if (icon) embed.setThumbnail(icon);

  await client.channels.send(config.channels.guildsId, {
    embeds: [embed],
  });
};

createEvent({
  name: 'Guild Create',
  event: Events.GuildCreate,
  run: async (guild: Guild) => {
    try {
      if ((client.uptime ?? 0) >= STARTUP_GRACE) {
        markFreshGuild(guild.id);
      }

      if (!(await isNewGuild(guild.id))) return;

      if ((client.uptime ?? 0) < STARTUP_GRACE) return;

      await sendThanks(guild);
      await sendLog(guild);
    } catch (error) {
      logger.error(
        `[Nori] Guild Create handler failed for ${guild.id}:`,
        error,
        { guildId: guild.id },
      );
    }
  },
});
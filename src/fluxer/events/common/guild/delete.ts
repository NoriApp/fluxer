import { EmbedBuilder, Events, type Guild } from '@fluxerjs/core';
import { client, createEvent } from '#base';
import config from '#nori/config/default.config.js';

createEvent({
  name: 'Guild Delete',
  event: Events.GuildDelete,
  run: async (guild: Guild) => {
    try {
      const info = guild as unknown as { name?: string; memberCount?: number; ownerId?: string };

      const embed = new EmbedBuilder()
        .setColor(config.color)
        .setTitle('Left a server')
        .addFields(
          { name: 'Server', value: info.name ?? 'Unknown', inline: true },
          { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
          { name: 'Members', value: String(info.memberCount ?? 'Unknown'), inline: true },
          { name: 'Owner ID', value: info.ownerId ? `\`${info.ownerId}\`` : 'Unknown', inline: true },
        )
        .setTimestamp();

      const icon = guild.iconURL();
      if (icon) embed.setThumbnail(icon);

      await client.channels.send(config.channels.guildsId, { embeds: [embed] });
    } catch (error) {
      logger.error(`[Nori] Guild Delete handler failed for ${guild.id}:`, error, { guildId: guild.id });
    }
  },
});

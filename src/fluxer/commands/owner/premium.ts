import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { db } from '#nori/db/index.js';
import { getGuildMusic } from '#nori/lib/music.js';

createCommand({
  name: 'premium',
  initTerms: false,
  hidden: true,
  async run(ctx) {
    if (!(config.developerIds as readonly string[]).includes(ctx.user.id)) return;

    const p = ctx.t.commands.owner.premium;

    const respond = (description: string) =>
      ctx.reply({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(description)] });

    const guildId = ctx.args[0]?.trim();
    const action = ctx.args[1]?.trim().toLowerCase();

    if (!guildId || !/^\d+$/.test(guildId) || (action && action !== 'on' && action !== 'off')) {
      await respond(p.usage(ctx.prefix));
      return;
    }

    if (!action) {
      const music = await getGuildMusic(guildId);

      await respond(p.status(guildId, music.premium));
      return;
    }

    const enabled = action === 'on';

    const saved = await db.guild
      .updateOne({ guildId }, { $set: { premium: enabled } }, { upsert: true })
      .then(() => true)
      .catch(() => false);

    if (!saved) {
      await respond(p.failed);
      return;
    }

    await respond(p.status(guildId, enabled));
  },
});

import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import { getQueue, skipTrack } from '#nori/structures/manager/lavalink.js';

createCommand({
  name: 'skip',
  nameLocalizations: {
    'pt-BR': 'pular',
    'es-ES': 'saltar',
  },
  category: Category.Music,
  ...setDescription.Music({
    'en-US': 'Skips the current song',
    'pt-BR': 'Pula a música atual',
    'es-ES': 'Salta la canción actual',
  }),
  aliases: ['next'],
  async run(ctx) {
    const m = ctx.t.commands.music.skip;

    const respond = (description: string) =>
      ctx.reply({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(description)] });

    const queue = getQueue(ctx.guildId);

    if (!queue?.current) {
      await respond(m.nothingPlaying);
      return;
    }

    const voiceChannelId = ctx.voiceManager.getVoiceChannelId(ctx.guildId, ctx.user.id);

    if (!voiceChannelId) {
      await respond(m.notInVoice);
      return;
    }

    if (voiceChannelId !== queue.voiceChannelId) {
      await respond(m.notInSameVoice);
      return;
    }

    const title = queue.current.title;

    if (!skipTrack(ctx.guildId)) {
      await respond(m.nothingPlaying);
      return;
    }

    await respond(m.skipped(title));
  },
});

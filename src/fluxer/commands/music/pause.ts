import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import { getQueue, pauseQueue } from '#nori/structures/manager/lavalink.js';

createCommand({
  name: 'pause',
  nameLocalizations: {
    'pt-BR': 'pausar',
    'es-ES': 'pausar',
  },
  category: Category.Music,
  ...setDescription.Music({
    'en-US': 'Pauses the current song',
    'pt-BR': 'Pausa a música atual',
    'es-ES': 'Pausa la canción actual',
  }),
  async run(ctx) {
    const m = ctx.t.commands.music.pause;

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

    if (queue.paused) {
      await respond(m.alreadyPaused);
      return;
    }

    const title = queue.current.title;

    if (!pauseQueue(ctx.guildId)) {
      await respond(m.nothingPlaying);
      return;
    }

    await respond(m.paused(title));
  },
});

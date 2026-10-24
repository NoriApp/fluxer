import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import { getQueue, resumeQueue } from '#nori/structures/manager/lavalink.js';

createCommand({
  name: 'resume',
  nameLocalizations: {
    'pt-BR': 'continuar',
    'es-ES': 'reanudar',
  },
  category: Category.Music,
  ...setDescription.Music({
    'en-US': 'Resumes the paused song',
    'pt-BR': 'Retoma a música pausada',
    'es-ES': 'Reanuda la canción pausada',
  }),
  aliases: ['unpause'],
  async run(ctx) {
    const m = ctx.t.commands.music.resume;

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

    if (!queue.paused) {
      await respond(m.notPaused);
      return;
    }

    const title = queue.current.title;

    if (!resumeQueue(ctx.guildId)) {
      await respond(m.notPaused);
      return;
    }

    await respond(m.resumed(title));
  },
});

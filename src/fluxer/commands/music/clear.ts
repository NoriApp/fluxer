import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import { clearQueue, getQueue } from '#nori/structures/manager/lavalink.js';

createCommand({
  name: 'clear',
  nameLocalizations: {
    'pt-BR': 'limpar',
    'es-ES': 'limpiar',
  },
  category: Category.Music,
  ...setDescription.Music({
    'en-US': 'Clears the queue without stopping the current song',
    'pt-BR': 'Limpa a fila sem parar a música atual',
    'es-ES': 'Limpia la cola sin detener la canción actual',
  }),
  async run(ctx) {
    const m = ctx.t.commands.music.clear;

    const respond = (description: string) =>
      ctx.reply({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(description)] });

    const queue = getQueue(ctx.guildId);

    if (!queue?.current && !queue?.tracks.length) {
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

    const total = clearQueue(ctx.guildId);

    if (total === 0) {
      await respond(m.empty);
      return;
    }

    await respond(m.cleared(total));
  },
});

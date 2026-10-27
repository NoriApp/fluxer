import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import { getQueue, shuffleQueue } from '#nori/structures/manager/lavalink.js';

createCommand({
  name: 'shuffle',
  nameLocalizations: {
    'pt-BR': 'embaralhar',
    'es-ES': 'mezclar',
  },
  category: Category.Music,
  ...setDescription.Music({
    'en-US': 'Shuffles the songs in the queue',
    'pt-BR': 'Embaralha as músicas da fila',
    'es-ES': 'Mezcla las canciones de la cola',
  }),
  async run(ctx) {
    const m = ctx.t.commands.music.shuffle;

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

    const total = shuffleQueue(ctx.guildId);

    if (total === 0) {
      await respond(m.notEnough);
      return;
    }

    await respond(m.shuffled(total));
  },
});

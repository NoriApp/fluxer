import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import { destroyQueue, getQueue } from '#nori/structures/manager/lavalink.js';

createCommand({
  name: 'stop',
  category: Category.Music,
  ...setDescription.Music({
    'pt-BR': 'Para a música, limpa a fila e sai do canal de voz.',
    'en-US': 'Stops the music, clears the queue and leaves the voice channel.',
    'es-ES': 'Detiene la música, limpia la cola y sale del canal de voz.',
  }),
  aliases: ['parar', 'leave', 'sair', 'disconnect'],
  async run(ctx) {
    const m = ctx.t.commands.music.stop;

    const reply = (description: string) =>
      ctx.reply({
        embeds: [new EmbedBuilder().setColor(config.color).setDescription(description)],
      });

    const queue = getQueue(ctx.guildId);

    if (!queue) {
      await reply(m.nothingPlaying);
      return;
    }

    const voiceChannelId = ctx.voiceManager.getVoiceChannelId(ctx.guildId, ctx.user.id);

    if (!voiceChannelId) {
      await reply(m.notInVoice);
      return;
    }

    if (voiceChannelId !== queue.voiceChannelId) {
      await reply(m.notInSameVoice);
      return;
    }

    destroyQueue(ctx.guildId);

    await reply(m.stopped);
  },
});

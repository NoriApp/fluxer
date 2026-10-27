import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import { getQueue, setLoopMode, type LoopMode } from '#nori/structures/manager/lavalink.js';

const modes: LoopMode[] = ['off', 'track', 'queue', 'playlist'];

createCommand({
  name: 'loop',
  nameLocalizations: {
    'pt-BR': 'repetir',
    'es-ES': 'repetir',
  },
  category: Category.Music,
  ...setDescription.Music({
    'en-US': 'Sets the loop mode: off, current song, whole queue or playlist',
    'pt-BR': 'Define o modo de repetição: desligado, música atual, fila inteira ou playlist',
    'es-ES': 'Define el modo de repetición: apagado, canción actual, cola completa o playlist',
  }),
  async run(ctx) {
    const m = ctx.t.commands.music.loop;

    const respond = (description: string) =>
      ctx.reply({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(description)] });

    const input = ctx.args[0]?.toLowerCase();
    const mode = modes.find((item) => item === input);

    if (!mode) {
      await respond(m.usage(ctx.prefix));
      return;
    }

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

    setLoopMode(ctx.guildId, mode);

    await respond(m[mode]);
  },
});

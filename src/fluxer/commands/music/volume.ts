import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import {
  MAX_VOLUME,
  MIN_VOLUME,
  getQueue,
  setQueueVolume,
} from '#nori/structures/manager/lavalink.js';

createCommand({
  name: 'volume',
  nameLocalizations: {
    'es-ES': 'volumen',
  },
  category: Category.Music,
  ...setDescription.Music({
    'en-US': 'Shows or changes the player volume',
    'pt-BR': 'Mostra ou altera o volume do player',
    'es-ES': 'Muestra o cambia el volumen del reproductor',
  }),
  aliases: ['vol'],
  async run(ctx) {
    const m = ctx.t.commands.music.volume;

    const respond = (description: string) =>
      ctx.reply({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(description)] });

    const queue = getQueue(ctx.guildId);

    if (!queue) {
      await respond(m.nothingPlaying);
      return;
    }

    const input = ctx.args[0]?.replace('%', '');

    if (input === undefined) {
      await respond(m.current(queue.volume));
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

    const volume = Number(input);

    if (!Number.isInteger(volume) || volume < MIN_VOLUME || volume > MAX_VOLUME) {
      await respond(m.invalid(MIN_VOLUME, MAX_VOLUME));
      return;
    }

    setQueueVolume(queue, volume);

    await respond(m.changed(volume));
  },
});

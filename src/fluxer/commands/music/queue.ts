import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import { getQueue, type QueueTrack } from '#nori/structures/manager/lavalink.js';

const PAGE_SIZE = 10;
const TITLE_LIMIT = 50;

const formatDuration = (ms: number) => {
  if (ms <= 0) return '--:--';

  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

const label = (track: QueueTrack) => {
  const clean = track.title.replace(/[[\]]/g, '');
  const title = clean.length > TITLE_LIMIT ? `${clean.slice(0, TITLE_LIMIT - 1)}…` : clean;

  return track.uri ? `[${title}](${track.uri})` : `**${title}**`;
};

createCommand({
  name: 'queue',
  nameLocalizations: {
    'pt-BR': 'fila',
    'es-ES': 'cola',
  },
  category: Category.Music,
  ...setDescription.Music({
    'en-US': 'Shows the songs in the queue',
    'pt-BR': 'Mostra as músicas da fila',
    'es-ES': 'Muestra las canciones de la cola',
  }),
  aliases: ['q'],
  async run(ctx) {
    const m = ctx.t.commands.music.queue;

    const respond = (description: string) =>
      ctx.reply({ embeds: [new EmbedBuilder().setColor(config.color).setDescription(description)] });

    const queue = getQueue(ctx.guildId);
    const current = queue?.current ?? null;
    const upcoming = queue?.tracks ?? [];

    if (!current && upcoming.length === 0) {
      await respond(m.empty);
      return;
    }

    const pages = Math.max(1, Math.ceil(upcoming.length / PAGE_SIZE));
    const raw = ctx.args[0];
    const page = raw === undefined ? 1 : Number(raw);

    if (!Number.isInteger(page) || page < 1 || page > pages) {
      await respond(m.invalidPage(pages));
      return;
    }

    const start = (page - 1) * PAGE_SIZE;

    const lines = upcoming
      .slice(start, start + PAGE_SIZE)
      .map(
        (track, index) =>
          `\`${start + index + 1}.\` ${label(track)} - ${track.author} \`${formatDuration(track.duration)}\``,
      );

    const sections: string[] = [];

    if (page === 1 && current) {
      sections.push(
        [
          `**${m.nowPlaying}**`,
          `${label(current)} - ${current.author} \`${formatDuration(current.duration)}\` • ${m.requestedBy(current.requester.username)}`,
        ].join('\n'),
      );
    }

    sections.push([`**${m.upNext}**`, lines.length > 0 ? lines.join('\n') : m.nothingNext].join('\n'));

    const embed = new EmbedBuilder()
      .setTitle(m.title)
      .setDescription(sections.join('\n\n'))
      .setColor(config.color)
      .setFooter({ text: m.footer(page, pages, upcoming.length) });

    await ctx.reply({ embeds: [embed] });
  },
});

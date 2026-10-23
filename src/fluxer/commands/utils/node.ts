import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import { getAllNodeStatus } from '#nori/structures/manager/lavalink.js';

const formatBytes = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

const formatDuration = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds}s`]
    .filter(Boolean)
    .join(' ');
};

createCommand({
  name: 'node',
  category: Category.Utilities,
  ...setDescription.Utilities({
    'pt-BR': 'Mostra o status de todos os nodes de música.',
    'en-US': 'Shows the status of all music nodes.',
    'es-ES': 'Muestra el estado de todos los nodos de música.',
  }),
  aliases: ['nodes'],
  async run(ctx) {
    const n = ctx.t.commands.utilities.node;

    const formatLatency = (ms: number | null) =>
      ms === null || ms < 0 ? n.unavailable : `${ms}ms`;

    const nodes = await getAllNodeStatus();

    const fields = nodes.map((node) => ({
      name: node.id,
      value: node.online
        ? [
            `${n.status}: ${n.online}`,
            `${n.latency}: ${formatLatency(node.latency)}`,
            `${n.players}: ${node.playingPlayers}/${node.players}`,
            `${n.cpu}: ${(node.cpuLoad * 100).toFixed(1)}%`,
            `${n.ram}: ${formatBytes(node.memoryUsed)} / ${formatBytes(node.memoryAllocated)}`,
            `${n.uptime}: ${formatDuration(node.uptime)}`,
          ].join('\n')
        : `${n.status}: ${n.offline}`,
      inline: true,
    }));

    const embed = new EmbedBuilder()
      .setTitle(n.title)
      .setColor(config.color)
      .addFields(...fields)
      .setFooter({ text: n.footer(ctx.user.username) })
      .setTimestamp();

    await ctx.reply({ embeds: [embed] });
  },
});

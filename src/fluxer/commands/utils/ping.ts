import { Client, EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import { getNodeStatus } from '#nori/structures/manager/lavalink.js';
import { getShardInfo, getTotalGuilds } from '#nori/structures/functions/client/info/shard.js';

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

const sampleCpu = async () => {
  const startUsage = process.cpuUsage();
  const startTime = process.hrtime.bigint();

  await new Promise((resolve) => setTimeout(resolve, 250));

  const usage = process.cpuUsage(startUsage);
  const elapsed = Number(process.hrtime.bigint() - startTime) / 1000;

  return ((usage.user + usage.system) / elapsed) * 100;
};

createCommand({
  name: 'ping',
  category: Category.Utilities,
  ...setDescription.Utilities({
    'pt-BR': 'Mostra a latência e o status do bot.',
    'en-US': 'Shows the bot latency and status.',
    'es-ES': 'Muestra la latencia y el estado del bot.',
  }),
  async run(ctx) {
    const p = ctx.t.commands.utilities.ping;

    const formatLatency = (ms: number | null) =>
      ms === null || ms < 0 ? p.unavailable : `${ms}ms`;

    const messageDelay = Math.max(0, Date.now() - ctx.message.createdAt.getTime());

    const measureRest = async () => {
      const started = Date.now();

      try {
        await ctx.client.rest.get(Client.Routes.channel(ctx.channelId));
        return Date.now() - started;
      } catch {
        return null;
      }
    };

    const [restLatency, node, cpu] = await Promise.all([
      measureRest(),
      getNodeStatus(),
      sampleCpu(),
    ]);

    const memory = process.memoryUsage();
    const shardInfo = getShardInfo();

    const shardLabel = [
      shardInfo.id === undefined ? null : `Shard ${shardInfo.id}`,
      shardInfo.name,
    ]
      .filter(Boolean)
      .join(' · ');

    const nodeLines = node.online
      ? [
          `${p.status}: ${p.online}`,
          `${p.latency}: ${formatLatency(node.latency)}`,
          `${p.players}: ${node.playingPlayers}/${node.players}`,
          `${p.cpu}: ${(node.cpuLoad * 100).toFixed(1)}%`,
          `${p.ram}: ${formatBytes(node.memoryUsed)} / ${formatBytes(node.memoryAllocated)}`,
          `${p.uptime}: ${formatDuration(node.uptime)}`,
        ]
      : [`${p.status}: ${p.offline}`];

    const embed = new EmbedBuilder()
      .setTitle(p.title)
      .setColor(config.color)
      .addFields(
        {
          name: p.latencyField,
          value: [
            `${p.gateway}: ${formatLatency(ctx.client.ws.ping)}`,
            `${p.api}: ${formatLatency(restLatency)}`,
            `${p.message}: ${formatLatency(messageDelay)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: p.botField,
          value: [
            `${p.cpu}: ${cpu.toFixed(1)}%`,
            `${p.ram}: ${formatBytes(memory.rss)}`,
            `${p.heap}: ${formatBytes(memory.heapUsed)}`,
            `${p.uptime}: ${formatDuration(ctx.client.uptime ?? 0)}`,
            `${p.servers}: ${getTotalGuilds(ctx.client)}`,
            shardLabel,
            `Node.js: ${process.version}`,
          ]
            .filter(Boolean)
            .join('\n'),
          inline: true,
        },
        {
          name: p.nodeField(node.id),
          value: nodeLines.join('\n'),
          inline: true,
        },
      )
      .setFooter({ text: p.footer(ctx.user.username) })
      .setTimestamp();

    await ctx.reply({ embeds: [embed] });
  },
});

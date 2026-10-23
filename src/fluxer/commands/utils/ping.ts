import { Client, EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';

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

    const restLatency = await measureRest();

    const embed = new EmbedBuilder()
      .setTitle(p.title)
      .setColor(config.color)
      .addFields({
        name: p.latencyField,
        value: [
          `${p.gateway}: ${formatLatency(ctx.client.ws.ping)}`,
          `${p.api}: ${formatLatency(restLatency)}`,
          `${p.message}: ${formatLatency(messageDelay)}`,
        ].join('\n'),
        inline: true,
      })
      .setFooter({ text: p.footer(ctx.user.username) })
      .setTimestamp();

    await ctx.reply({ embeds: [embed] });
  },
});

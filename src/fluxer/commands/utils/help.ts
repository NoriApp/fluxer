import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { getLanguages, resolveLanguage } from '#nori/i18n/index.js';
import { Category, getCategoryLabel, setDescription } from '#nori/lib/category.js';

type Locale = NonNullable<Parameters<typeof getCategoryLabel>[1]>;

createCommand({
  name: 'help',
  nameLocalizations: {
    'pt-BR': 'ajuda',
    'en-US': 'help',
    'es-ES': 'ayuda',
  },
  category: Category.Utilities,
  ...setDescription.Utilities({
    'pt-BR': 'Mostra os comandos do bot.',
    'en-US': 'Shows the bot commands.',
    'es-ES': 'Muestra los comandos del bot.',
  }),
  aliases: ['h', 'cmds', 'commands', 'comandos'],
  async run(ctx) {
    const h = ctx.t.commands.utilities.help;

    const LOCALE = (getLanguages().find((code) => resolveLanguage(code) === ctx.t) ?? 'pt-BR') as Locale;
    const target = ctx.args[0]?.toLowerCase();

    if (target) {
      const found = ctx.commands.get(target);

      if (!found) {
        await ctx.reply(h.notFound(target));
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${ctx.prefix}${found.name}`)
        .setDescription(
          found.descriptionLocalizations?.[LOCALE] ?? found.description ?? h.noDescription,
        )
        .setColor(config.color);

      if (found.category) {
        embed.addFields({
          name: h.categoryField,
          value: getCategoryLabel(found.category, LOCALE),
          inline: true,
        });
      }

      if (found.aliases?.length) {
        embed.addFields({
          name: h.aliasesField,
          value: found.aliases.map((alias) => `\`${ctx.prefix}${alias}\``).join(', '),
          inline: true,
        });
      }

      await ctx.reply({ embeds: [embed] });
      return;
    }

    const unique = [...new Set(ctx.commands.values())].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const groups = new Map<string, string[]>();

    for (const item of unique) {
      const label = item.category ? getCategoryLabel(item.category, LOCALE) : h.otherCategory;
      const text = item.descriptionLocalizations?.[LOCALE] ?? item.description ?? h.noDescription;
      const lines = groups.get(label) ?? [];

      lines.push(`\`${ctx.prefix}${item.name}\` - ${text}`);
      groups.set(label, lines);
    }

    const embed = new EmbedBuilder()
      .setTitle(h.title)
      .setColor(config.color)
      .addFields(
        ...[...groups].map(([name, lines]) => ({
          name,
          value: lines.join('\n'),
          inline: false,
        })),
      )
      .setFooter({ text: h.footer(ctx.prefix) })
      .setTimestamp();

    await ctx.reply({ embeds: [embed] });
  },
});

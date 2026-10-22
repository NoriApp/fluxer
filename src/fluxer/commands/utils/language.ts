import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { db } from '#nori/db/index.js';
import { getLanguages, resolveLanguage } from '#nori/i18n/index.js';
import { Category, setDescription } from '#nori/lib/category.js';

createCommand({
  name: 'language',
  category: Category.Utilities,
  ...setDescription.Utilities({
    'pt-BR': 'Mostra ou altera o seu idioma.',
    'en-US': 'Shows or changes your language.',
    'es-ES': 'Muestra o cambia tu idioma.',
  }),
  aliases: [
    'lang',
    'linguagem',
    'setlang',
    'setlanguage',
    'setlinguagem',
    'setarlang',
    'setarlanguage',
    'setarlinguagem',
  ],
  async run(ctx) {
    const l = ctx.t.commands.utilities.language;

    const reply = (description: string) =>
      ctx.reply({
        embeds: [new EmbedBuilder().setColor(config.color).setDescription(description)],
      });

    const languages = getLanguages();
    const list = languages.map((code) => `\`${code}\``).join(', ');
    const input = ctx.args[0]?.trim();

    if (!input) {
      const current = languages.find((code) => resolveLanguage(code) === ctx.t) ?? languages[0];

      await reply(`${l.current(current)}\n${l.available(list)}`);
      return;
    }

    const language = languages.find((code) => code.toLowerCase() === input.toLowerCase());

    if (!language) {
      await reply(l.invalid(list));
      return;
    }

    const saved = await db.user
      .updateOne({ userId: ctx.user.id }, { $set: { language } }, { upsert: true })
      .then(() => true)
      .catch(() => false);

    if (!saved) {
      await reply(l.failed);
      return;
    }
    await reply(resolveLanguage(language).commands.utilities.language.changed(language));
  },
});

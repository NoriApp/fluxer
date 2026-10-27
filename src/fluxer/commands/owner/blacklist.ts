import { EmbedBuilder } from '@fluxerjs/core';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category } from '#nori/lib/category.js';
import { addBlacklist, formatRemaining, getBlacklisted, listBlacklist, removeBlacklist } from '#nori/lib/blacklist.js';

const LIST_LIMIT = 20;

const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 } as const;

const categories = Object.entries(Category)
  .filter(([key]) => Number.isNaN(Number(key)))
  .map(([key, value]) => ({ key: key.toLowerCase(), value: String(value) }));

const parseDuration = (input: string) => {
  if (['perm', 'permanent', 'permanente'].includes(input)) return null;

  const match = /^(\d+)([smhdw])$/.exec(input);

  if (!match || Number(match[1]) <= 0) return undefined;

  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
};

createCommand({
  name: 'blacklist',
  aliases: ['bl'],
  initTerms: false,
  hidden: true,
  async run(ctx) {
    const developers = config.developerIds as readonly string[];

    if (!developers.includes(ctx.user.id)) return;

    const b = ctx.t.commands.owner.blacklist;
    const categoryNames = categories.map((item) => item.value).join(', ');

    const respond = (description: string, title?: string) => {
      const embed = new EmbedBuilder().setColor(config.color).setDescription(description);
      if (title) embed.setTitle(title);

      return ctx.reply({ embeds: [embed] });
    };

    const action = ctx.args[0]?.toLowerCase();

    if (action === 'list') {
      const entries = await listBlacklist();

      if (entries.length === 0) {
        await respond(b.empty);
        return;
      }

      const lines = entries
        .slice(0, LIST_LIMIT)
        .map((entry) =>
          b.entry(
            entry.userId,
            entry.category ?? b.all,
            formatRemaining(entry.expiresAt) ?? b.permanent,
            entry.reason ?? b.noReason,
          ),
        );

      if (entries.length > LIST_LIMIT) lines.push(b.more(entries.length - LIST_LIMIT));

      await respond(lines.join('\n'), b.listTitle(entries.length));
      return;
    }

    if (action !== 'add' && action !== 'remove' && action !== 'check') {
      await respond(b.usage(ctx.prefix, categoryNames));
      return;
    }

    const id = ctx.args[1]?.replace(/\D/g, '');

    if (!id) {
      await respond(b.usage(ctx.prefix, categoryNames));
      return;
    }

    if (action === 'check') {
      const entry = await getBlacklisted(id);

      if (!entry) {
        await respond(b.notFound(id));
        return;
      }

      await respond(
        b.check(
          id,
          entry.reason ?? b.noReason,
          entry.authorId ?? ctx.user.id,
          entry.category ?? b.all,
          formatRemaining(entry.expiresAt) ?? b.permanent,
        ),
      );
      return;
    }

    if (action === 'remove') {
      const result = await removeBlacklist(id);

      if (result === 'failed') {
        await respond(b.failed);
        return;
      }

      await respond(result === 'notFound' ? b.notFound(id) : b.removed(id));
      return;
    }

    if (developers.includes(id)) {
      await respond(b.protected);
      return;
    }

    const scopeInput = ctx.args[2]?.toLowerCase();
    const durationInput = ctx.args[3]?.toLowerCase();

    if (!scopeInput || !durationInput) {
      await respond(b.usage(ctx.prefix, categoryNames));
      return;
    }

    const found = categories.find((item) => item.key === scopeInput || item.value.toLowerCase() === scopeInput);

    if (scopeInput !== 'all' && !found) {
      await respond(b.invalidScope(categoryNames));
      return;
    }

    const duration = parseDuration(durationInput);

    if (duration === undefined) {
      await respond(b.invalidDuration);
      return;
    }

    const category = found?.value ?? null;
    const expiresAt = duration === null ? null : new Date(Date.now() + duration);
    const reason = ctx.args.slice(4).join(' ').trim() || null;

    const result = await addBlacklist(id, reason, ctx.user.id, category, expiresAt);

    if (result === 'failed') {
      await respond(b.failed);
      return;
    }

    const scope = category ?? b.all;
    const time = formatRemaining(expiresAt) ?? b.permanent;

    await respond(result === 'updated' ? b.updated(id, scope, time) : b.added(id, scope, time));
  },
});

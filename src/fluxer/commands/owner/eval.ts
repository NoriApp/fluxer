import { inspect } from 'node:util';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { db } from '#nori/db/index.js';
import { env } from '#nori/env.js';
import { forgetTerms } from '#nori/structures/functions/client/initTerms.js';

type AsyncFn = (...args: unknown[]) => Promise<unknown>;
type AsyncFnConstructor = new (...args: string[]) => AsyncFn;

const AsyncFunction = Object.getPrototypeOf(async () => null).constructor as AsyncFnConstructor;

const MAX_LENGTH = 1900;

const extractCode = (content: string, prefix: string) =>
  content
    .slice(prefix.length)
    .trim()
    .replace(/^\S+\s*/, '')
    .replace(/^```(?:\w+)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

const compile = (names: string[], code: string) => {
  try {
    return new AsyncFunction(...names, `return (${code}\n)`);
  } catch {
    return new AsyncFunction(...names, code);
  }
};

const format = (value: unknown) => {
  const text = typeof value === 'string' ? value : inspect(value, { depth: 1 });
  const token = String(env.TOKEN ?? '');
  const safe = token ? text.split(token).join('[redacted]') : text;

  return safe.length > MAX_LENGTH ? `${safe.slice(0, MAX_LENGTH)}...` : safe;
};

const block = (text: string) => `\`\`\`js\n${text}\n\`\`\``;

createCommand({
  name: 'eval',
  initTerms: false,
  run: async (ctx) => {
    if (!(config.developerIds as readonly string[]).includes(ctx.user.id)) return;

    const code = extractCode(ctx.message.content, ctx.prefix);
    if (!code) return;

    const scope: Record<string, unknown> = {
      ctx,
      client: ctx.client,
      message: ctx.message,
      user: ctx.user,
      guildId: ctx.guildId,
      channelId: ctx.channelId,
      args: ctx.args,
      prefix: ctx.prefix,
      commands: ctx.commands,
      voiceManager: ctx.voiceManager,
      reply: ctx.reply,
      config,
      db,
      forgetTerms,
    };

    try {
      const result = await compile(Object.keys(scope), code)(...Object.values(scope));
      await ctx.message.reply(block(format(result))).catch(() => null);
    } catch (error) {
      const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
      await ctx.message.reply(block(format(text))).catch(() => null);
    }
  },
});

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, Events, type Message } from '@fluxerjs/core';
import { attachShardClientUtil } from '@fluxerjs/sharding';
import { getVoiceManager } from '@fluxerjs/voice';
import { logger } from '#nori/structures/utils/logger.js';
import { env as loadedEnv } from '#nori/env.js';
import loadedConfig from '#nori/config/default.config.js';
import '#nori/db/index.js';
import '#nori/structures/functions/client/constants.js';
import { getLanguage, type Language } from '#nori/i18n/index.js';
import { handleTermsReply, initTerms } from '#nori/structures/functions/client/initTerms.js';
import type { Category, Descriptions, Locale } from '#nori/lib/category.js';

Object.assign(globalThis, { env: loadedEnv, config: loadedConfig });

export const PREFIX = loadedConfig.prefix;

const FLUXER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fluxer');

export const client = new Client();
logger.setClient(client);
export const shard = process.send
  ? attachShardClientUtil(client as unknown as Parameters<typeof attachShardClientUtil>[0])
  : null;
export const voiceManager = getVoiceManager(client, { shardId: shard?.ids?.[0] ?? 0 });
export const commands = new Map<string, RegisteredCommand>();

const events: EventDefinition[] = [];

export type CommandContext = {
  client: Client;
  message: Message;
  user: Message['author'];
  guildId: string;
  channelId: string;
  args: string[];
  prefix: string;
  commands: Map<string, RegisteredCommand>;
  voiceManager: ReturnType<typeof getVoiceManager>;
  reply: Message['reply'];
  t: Language;
};

export type Command = {
  name: string;
  nameLocalizations?: Partial<Record<Locale, string>>;
  category?: Category;
  description?: string;
  descriptionLocalizations?: Descriptions;
  aliases?: string[];
  initTerms?: boolean;
  hidden?: boolean;
  run: (ctx: CommandContext) => Promise<void> | void;
};

export type RegisteredCommand = Omit<Command, 'run'> & {
  run: (ctx: Omit<CommandContext, 't'>) => Promise<void> | void;
};

export type EventDefinition = {
  name: string;
  event: string;
  once?: boolean;
  run: (...args: any[]) => Promise<void> | void;
};

type Emitter = {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  once: (event: string, listener: (...args: unknown[]) => void) => unknown;
};

export function createCommand(command: Command) {
  const registered: RegisteredCommand = {
    ...command,
    run: async (ctx) => {
      if (command.initTerms !== false && !(await initTerms(ctx.message))) return;

      const t = await getLanguage(ctx.user.id);

      await command.run({ ...ctx, t });
    },
  };

  commands.set(command.name.toLowerCase(), registered);

  const names = [...(command.aliases ?? []), ...Object.values(command.nameLocalizations ?? {})];

  for (const name of names) {
    if (name) commands.set(name.toLowerCase(), registered);
  }

  return command;
}

export function createEvent(definition: EventDefinition) {
  events.push(definition);
  return definition;
}

const walk = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) return walk(fullPath);
      if (/\.(ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) return [fullPath];

      return [];
    }),
  );

  return files.flat();
};

const importAll = async (dir: string) => {
  let files: string[] = [];

  try {
    files = await walk(dir);
  } catch (error) {
    logger.error(`[Nori] Failed to read ${path.basename(dir)} directory:`, error);
    return;
  }

  for (const file of files) {
    try {
      await import(pathToFileURL(file).href);
    } catch (error) {
      logger.error(`[Nori] Failed to load ${path.basename(file)}:`, error);
    }
  }
};

const bindEvents = () => {
  const emitter = client as unknown as Emitter;

  for (const definition of events) {
    const listener = async (...args: unknown[]) => {
      try {
        if (definition.event === Events.MessageCreate && handleTermsReply(args[0] as Message)) return;

        await definition.run(...(args.length ? args : [client]));
      } catch (error) {
        logger.error(`[Nori] Event ${definition.name} failed:`, error);
      }
    };

    if (definition.once) emitter.once(definition.event, listener);
    else emitter.on(definition.event, listener);
  }
};

const bootstrap = async () => {
  await importAll(path.join(FLUXER_DIR, 'commands'));
  await importAll(path.join(FLUXER_DIR, 'events'));

  bindEvents();

  logger.info(`[Nori] Loaded ${new Set(commands.values()).size} commands and ${events.length} events.`);

  await client.login(env.TOKEN);
};

bootstrap().catch((error) => {
  logger.error('[Nori] Failed to start:', error);
  process.exit(1);
});

import { EmbedBuilder, type Client } from '@fluxerjs/core';

export type ErrorContext = {
  command?: string;
  scope?: string;
  guildId?: string;
  channelId?: string;
};

export type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  success: (...args: unknown[]) => void;
  error: (message?: unknown, error?: unknown, context?: ErrorContext) => void;
  setClient: (client: Client) => void;
};

const COLOR = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[91m',
  green: '\x1b[92m',
  yellow: '\x1b[93m',
  magenta: '\x1b[95m',
  cyan: '\x1b[96m',
  bold: '\x1b[1m',
} as const;

const useColor = !('NO_COLOR' in process.env);

const paint = (color: string, text: string) => (useColor ? `${color}${text}${COLOR.reset}` : text);

type Level = 'info' | 'warn' | 'error' | 'success' | 'debug';

const LEVELS: Record<Level, { label: string; color: string; sink: 'log' | 'warn' | 'error' }> = {
  info: { label: 'INFO', color: COLOR.cyan, sink: 'log' },
  warn: { label: 'WARN', color: COLOR.yellow, sink: 'warn' },
  error: { label: 'ERROR', color: COLOR.red, sink: 'error' },
  success: { label: 'OK', color: COLOR.green, sink: 'log' },
  debug: { label: 'DEBUG', color: COLOR.magenta, sink: 'log' },
};

const original = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const timestamp = () => new Date().toISOString().slice(11, 19);

const format = (value: unknown): string => {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const write = (level: Level, text: string) => {
  const { label, color, sink } = LEVELS[level];
  const time = paint(COLOR.gray, `[${timestamp()}]`);
  const badge = paint(`${COLOR.bold}${color}`, `[${label.padEnd(5)}]`);

  original[sink](`${time} ${badge} ${text}`);
};

const DEDUPE_MS = 10000;
const THROTTLE_MS = 1000;
const MAX_KEYS = 250;

let client: Client | null = null;
let lastSent = 0;
const recent = new Map<string, number>();

const isContext = (value: unknown): value is ErrorContext =>
  !!value &&
  typeof value === 'object' &&
  ('command' in value || 'scope' in value || 'guildId' in value || 'channelId' in value);

const buildEmbed = async (head: string, detail: string | null, context?: ErrorContext) => {
  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle(context?.command ? 'Command Error' : 'Error')
    .setTimestamp();

  if (context?.command) embed.addFields({ name: 'Command', value: `\`${context.command}\``, inline: true });
  if (context?.scope) embed.addFields({ name: 'Scope', value: `\`${context.scope}\``, inline: true });
  if (context?.guildId) embed.addFields({ name: 'Guild', value: `\`${context.guildId}\``, inline: true });
  if (context?.channelId) embed.addFields({ name: 'Channel', value: `<#${context.channelId}>`, inline: true });

  embed.addFields(
    { name: 'Error', value: `\`\`\`${head.slice(0, 1000)}\`\`\`` },
    { name: 'Log', value: `\`\`\`${(detail ?? 'No stack trace available').slice(0, 1000)}\`\`\`` },
  );

  if (context?.guildId) {
    const guild = await client!.guilds.fetch(context.guildId).catch(() => null);
    const icon = guild?.iconURL();
    if (icon) embed.setThumbnail(icon);
  }

  return embed;
};

const send = (head: string, detail: string | null, context?: ErrorContext) => {
  if (!client || typeof config === 'undefined') return;

  const now = Date.now();
  const key = `${context?.command ?? ''}:${context?.scope ?? ''}:${context?.guildId ?? ''}:${head}`;

  if ((recent.get(key) ?? 0) + DEDUPE_MS > now) return;
  if (lastSent + THROTTLE_MS > now) return;

  if (recent.size >= MAX_KEYS) {
    for (const [seenKey, seenAt] of recent) {
      if (now - seenAt >= DEDUPE_MS) recent.delete(seenKey);
    }
    if (recent.size >= MAX_KEYS) recent.clear();
  }

  recent.set(key, now);
  lastSent = now;

  buildEmbed(head, detail, context)
    .then((embed) => client?.channels.send(config.channels.errorsId, { embeds: [embed] }))
    .catch(() => null);
};

export const logger: Logger = {
  info: (...args) => write('info', args.map(format).join(' ')),
  warn: (...args) => write('warn', args.map(format).join(' ')),
  debug: (...args) => write('debug', args.map(format).join(' ')),
  success: (...args) => write('success', args.map(format).join(' ')),
  error: (message, error, context) => {
    const err = message instanceof Error ? message : error instanceof Error ? error : null;
    const head = message instanceof Error ? message.message : format(message ?? 'Unknown error');
    const detail = err
      ? err.stack ?? `${err.name}: ${err.message}`
      : error !== undefined && error !== null
        ? format(error)
        : null;

    write('error', detail ? `${head}\n${paint(COLOR.gray, detail)}` : head);
    send(head, detail, context);
  },
  setClient: (value) => {
    client = value;
  },
};

console.log = (...args: unknown[]) => logger.info(...args);
console.info = (...args: unknown[]) => logger.info(...args);
console.debug = (...args: unknown[]) => logger.debug(...args);
console.warn = (...args: unknown[]) => logger.warn(...args);
console.error = (...args: unknown[]) => logger.error(args[0], args[1], isContext(args[2]) ? args[2] : undefined);

globalThis.logger = logger;

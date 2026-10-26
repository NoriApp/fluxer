import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client, Guild } from '@fluxerjs/core';
import { getShardInfo } from '#nori/structures/functions/client/info/shard.js';

const directory = path.join(os.tmpdir(), 'nori-api');
const staleAfter = 120_000;
const memberTtl = 10 * 60_000;
const chunkSize = 5;

export type GuildInfo = {
  id: string;
  name: string;
  icon: string | null;
  acronym: string | null;
  members: number | null;
  shard: number | null;
};

export type ShardSnapshot = {
  id: number | null;
  name: string | null;
  ping: number | null;
  guilds: GuildInfo[];
  updatedAt: number;
};

const memberCache = new Map<string, { count: number | null; at: number }>();

const acronym = (name: string) =>
  Array.from(
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => Array.from(word)[0] ?? '')
      .join(''),
  )
    .slice(0, 3)
    .join('')
    .toUpperCase();

const memberCount = async (client: Client, guild: Guild) => {
  const cached = memberCache.get(guild.id);

  if (cached && Date.now() - cached.at < memberTtl) return cached.count;

  let count: number | null = null;

  try {
    const raw = (await client.rest.get(`/guilds/${guild.id}`)) as { member_count?: number };
    count = typeof raw.member_count === 'number' ? raw.member_count : null;
  } catch {
    count = null;
  }

  memberCache.set(guild.id, { count, at: Date.now() });

  return count;
};

const describe = async (client: Client, guild: Guild, shard: number | null): Promise<GuildInfo> => {
  const icon = guild.iconURL({ size: 128 });

  return {
    id: guild.id,
    name: guild.name,
    icon,
    acronym: icon ? null : acronym(guild.name),
    members: await memberCount(client, guild),
    shard,
  };
};

export const publishStats = async (client: Client) => {
  const { id, name } = getShardInfo();
  const guilds = [...client.guilds.values()];
  const described: GuildInfo[] = [];

  for (let index = 0; index < guilds.length; index += chunkSize) {
    const chunk = guilds.slice(index, index + chunkSize);
    described.push(...(await Promise.all(chunk.map((guild) => describe(client, guild, id ?? null)))));
  }

  const ping = client.ws.ping;

  const snapshot: ShardSnapshot = {
    id: id ?? null,
    name: name ?? null,
    ping: Number.isFinite(ping) && ping >= 0 ? ping : null,
    guilds: described,
    updatedAt: Date.now(),
  };

  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${id ?? process.pid}.json`), JSON.stringify(snapshot));
  } catch {}

  return snapshot;
};

export const readSnapshots = () => {
  const snapshots: ShardSnapshot[] = [];

  try {
    for (const file of fs.readdirSync(directory)) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as ShardSnapshot;

        if (Date.now() - data.updatedAt <= staleAfter) snapshots.push(data);
      } catch {}
    }
  } catch {}

  return snapshots.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
};

export const startStatsPublisher = (client: Client) => {
  const run = () => {
    publishStats(client).catch(() => null);
  };

  run();
  setTimeout(run, 15_000);
  setInterval(run, 60_000);
};

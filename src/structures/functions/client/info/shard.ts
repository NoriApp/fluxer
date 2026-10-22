import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Client } from '@fluxerjs/core';
import { shard } from '#base';
import config from '#nori/config/default.config.js';

const directory = path.join(os.tmpdir(), 'nori-shards');
const staleAfter = 120_000;

export const getShardInfo = () => {
  const id = shard?.ids?.[0];

  const cluster =
    id === undefined
      ? undefined
      : config.clusters.find((item) => (item.shardIds as readonly number[]).includes(id));

  return { id, name: cluster?.name };
};

export const publishShardStats = (client: Client) => {
  const { id } = getShardInfo();

  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, `${id ?? process.pid}.json`),
      JSON.stringify({ guilds: client.guilds.size, updatedAt: Date.now() }),
    );
  } catch {}
};

export const getTotalGuilds = (client: Client) => {
  publishShardStats(client);

  let total = 0;

  try {
    for (const file of fs.readdirSync(directory)) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as {
          guilds: number;
          updatedAt: number;
        };

        if (Date.now() - data.updatedAt <= staleAfter) total += data.guilds;
      } catch {}
    }
  } catch {}

  return total || client.guilds.size;
};

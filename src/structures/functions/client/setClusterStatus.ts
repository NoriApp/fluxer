import type { Client } from '@fluxerjs/core';
import { shard } from '#base';

let textIndex = 0;

export const setClusterStatus = (client: Client) => {
  const { status, texts } = config.presence;

  const shardId = shard?.ids?.[0];
  const primaryShardId = config.clusters[0]?.shardIds[0];

  if (shardId !== undefined && shardId !== primaryShardId) return;

  const text = texts[textIndex % texts.length];
  textIndex++;

  client.user?.setPresence({
    status,
    ...(text ? { customStatus: { text } } : {}),
  });
};

export const startClusterStatusRotation = (client: Client) => {
  setClusterStatus(client);
  setInterval(() => setClusterStatus(client), 30_000);
};

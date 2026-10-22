import type { Client } from '@fluxerjs/core';
import { shard } from '#base';

let textIndex = 0;

export const setClusterStatus = (client: Client) => {
  const { status, texts } = config.presence;

  const text = texts[textIndex % texts.length];
  textIndex++;

  const shardId = shard?.ids[0];
  const cluster =
    shardId === undefined
      ? undefined
      : config.clusters.find((item) => (item.shardIds as readonly number[]).includes(shardId));

  const content = [text, cluster ? `Cluster ${cluster.name}` : null].filter(Boolean).join(' | ');

  client.user?.setPresence({
    status,
    ...(content ? { customStatus: { text: content } } : {}),
  });
};

export const startClusterStatusRotation = (client: Client) => {
  setClusterStatus(client);
  setInterval(() => setClusterStatus(client), 30_000);
};

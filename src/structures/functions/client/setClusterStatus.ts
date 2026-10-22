import type { Client } from '@fluxerjs/core';
import { shard } from '#base';

export const setClusterStatus = (client: Client) => {
  const { status, text } = config.presence;

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

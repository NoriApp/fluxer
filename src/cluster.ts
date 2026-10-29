import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShardingManager } from '@fluxerjs/sharding';
import { logger } from '#nori/structures/utils/logger.js';
import { env } from '#nori/env.js';
import defaultConfig from '#nori/config/default.config.js';
import { ensureYtDlp } from '#nori/structures/manager/yt-dlp.js';

Object.assign(globalThis, { env, config: defaultConfig });

const filename = fileURLToPath(import.meta.url);
const extension = path.extname(filename);
const file = path.join(path.dirname(filename), `index${extension}`);
const execArgv = extension === '.ts' ? ['--import', 'tsx'] : [];

const start = async () => {
  await ensureYtDlp().catch((error) => {
    logger.error('[Nori] Failed to prepare yt-dlp:', error);
  });

  for (const cluster of defaultConfig.clusters) {
    const manager = new ShardingManager(file, {
      token: env.TOKEN,
      totalShards: cluster.totalShards,
      shardList: [...cluster.shardIds],
      shardsPerProcess: cluster.shardsPerProcess,
      spawnDelay: cluster.spawnDelay,
      spawnTimeout: cluster.spawnTimeout,
      execArgv,
    });

    manager.on('shardCreate', (shard) => {
      logger.info(`[Nori] Cluster ${cluster.name} created shard ${shard.id}.`);
    });

    await manager.spawn();
  }
};

start().catch((error) => {
  logger.error('[Nori] Cluster failed to start:', error);
  process.exit(1);
});

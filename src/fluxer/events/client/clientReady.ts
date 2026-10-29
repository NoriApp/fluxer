import { Events, type Client } from '@fluxerjs/core';
import { createEvent, shard } from '#base';
import { startApi } from '#nori/api/index.js';
import { startStatsPublisher } from '#nori/structures/utils/stats.js';
import { getShardInfo } from '#nori/structures/functions/client/info/shard.js';
import { startClusterStatusRotation } from '#nori/structures/functions/client/setClusterStatus.js';
import { ensureYtDlp } from '#nori/structures/manager/yt-dlp.js';
import { initLavalink } from '#nori/structures/manager/lavalink.js';
import { reportError } from '#nori/structures/manager/lavalink/report.js';

createEvent({
  name: 'Client Ready',
  event: Events.Ready,
  once: true,
  run: async (client: Client) => {
    if (!client.user) return;

    logger.info(`[Nori] Logged in as ${client.user.username}.`);

    startClusterStatusRotation(client);
    startStatsPublisher(client);
    shard?.notifyReady();

    const { id } = getShardInfo();

    if (id === undefined || id === 0) {
      startApi(client).catch((error) => reportError('api', error));
    }

    await ensureYtDlp().catch((error) => {
      logger.error('[Nori] Failed to prepare yt-dlp:', error);
    });

    await initLavalink({ id: client.user.id, username: client.user.username });
  },
});

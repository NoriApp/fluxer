import { Events, type Client } from '@fluxerjs/core';
import { createEvent, shard } from '#base';
import { startClusterStatusRotation } from '#nori/structures/functions/client/setClusterStatus.js';
import { ensureYtDlp } from '#nori/structures/manager/yt-dlp.js';
import { initLavalink } from '#nori/structures/manager/lavalink.js';

createEvent({
  name: 'Client Ready',
  event: Events.Ready,
  once: true,
  run: async (client: Client) => {
    if (!client.user) return;

    console.log(`[Nori] Logged in as ${client.user.username}.`);

    startClusterStatusRotation(client);
    shard?.notifyReady();

    await ensureYtDlp().catch((error) => {
      console.error('[Nori] Failed to prepare yt-dlp:', error);
    });

    await initLavalink({ id: client.user.id, username: client.user.username });
  },
});

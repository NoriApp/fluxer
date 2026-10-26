import type { Client } from '@fluxerjs/core';
import { AzuraServer } from 'azurajs/core';
import type { AzuraResponse } from 'azurajs/types';
import { Controller, Get, Ip, Res } from 'azurajs/decorators';
import { publishStats, readSnapshots } from '#nori/structures/utils/stats.js';
import config from '#nori/config/default.config.js';

let botClient: Client | null = null;

const snapshots = async () => {
  const stored = readSnapshots();

  if (stored.length > 0 || !botClient) return stored;

  return [await publishStats(botClient)];
};

@Controller('/')
class RootController {
  @Get()
  async home(@Ip() ip: string, @Res() res: AzuraResponse) {
    const shards = await snapshots();
    const pings = shards
      .map((item) => item.ping)
      .filter((ping): ping is number => ping !== null);

    res.json({
      status: 'ok',
      ip,
      latency: {
        gateway: pings.length
          ? Math.round(pings.reduce((sum, ping) => sum + ping, 0) / pings.length)
          : null,
        shards: shards.map((item) => ({
          id: item.id,
          name: item.name,
          ping: item.ping,
        })),
      },
    });
  }
}

@Controller('/bot')
class BotController {
  @Get('/guilds')
  async guilds(@Res() res: AzuraResponse) {
    const guilds = (await snapshots())
      .flatMap((item) => item.guilds)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({ total: guilds.length, guilds });
  }
}

export const startApi = async (client: Client) => {
  botClient = client;

  const app = new AzuraServer();

  app.register(RootController);
  app.register(BotController);

  await app.listen(config.api.port);

  console.log('[Nori] API is now online.');
};
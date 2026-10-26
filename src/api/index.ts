import type { Client } from '@fluxerjs/core';
import { AzuraClient } from 'azurajs';
import type { ResponseServer } from 'azurajs/types';
import { applyDecorators, Controller, Get, Ip, Res } from 'azurajs/decorators';
import { publishStats, readSnapshots } from '#nori/structures/utils/stats.js';

let botClient: Client | null = null;

const snapshots = async () => {
  const stored = readSnapshots();

  if (stored.length > 0 || !botClient) return stored;

  return [await publishStats(botClient)];
};

@Controller('/')
class RootController {
  @Get()
  async home(@Ip() ip: string, @Res() res: ResponseServer) {
    const shards = await snapshots();
    const pings = shards
      .map((item) => item.ping)
      .filter((ping): ping is number => ping !== null);

    res.json({
      status: 'ok',
      ip,
      latency: {
        gateway: pings.length
          ? Math.round(
              pings.reduce((sum, ping) => sum + ping, 0) / pings.length,
            )
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
  async guilds(@Res() res: ResponseServer) {
    const guilds = (await snapshots())
      .flatMap((item) => item.guilds)
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      total: guilds.length,
      guilds,
    });
  }
}

export const startApi = async (client: Client) => {
  botClient = client;

  const app = new AzuraClient();

  applyDecorators(app, [RootController, BotController]);

  await app.listen();

  console.log('[Nori] API is now online!');
};
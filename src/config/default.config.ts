import { createConfig, ms } from '#nori/structures/data/configuration.js';
import { env } from '#nori/env.js';

export default createConfig({
  prefix: 'n.',
  locale: 'pt-BR',
  color: 0xde1a1b,
  developerIds: ['1562066443707617281'],
  presence: {
    status: 'online',
    text: 'Radiohead',
  },
  clusters: [
    {
      name: 'Valhalla',
      totalShards: 1,
      shardIds: [0],
      shardsPerProcess: 1,
      spawnDelay: ms('5s'),
      spawnTimeout: ms('30s'),
    },
  ],
  music: {
    defaultSearchPlatform: 'spsearch',
    defaultVolume: 100,
    maxPlaylistTracks: 100,
    disconnectTime: ms('2min'),
  },
  nodes: [
    {
      id: 'Obisidian',
      host: env.OBISIDIAN_HOST,
      port: Number(env.OBISIDIAN_PORT),
      authorization: env.OBISIDIAN_PASSWORD,
      secure: String(env.OBISIDIAN_SECURE) === 'true',
      retryAmount: 25,
      retryDelay: ms('30s'),
      requestSignalTimeoutMS: ms('10s'),
      enableTrackStreamEndpoint: true,
      enableLoadStreamEndpoint: true,
    },
  ],
  audio: {
    binaryDir: './bin',
    sources: ['ytsearch', 'scsearch'],
    searchLimit: 5,
    socketTimeout: ms('15s'),
    timeout: ms('45s'),
    maxBuffer: 50 * 1024 * 1024,
    match: {
      exactSeconds: 3,
      nearSeconds: 10,
      farSeconds: 30,
    },
  },
  encoder: {
    bitrate: '128k',
    sampleRate: 48000,
    channels: 2,
    reconnectDelayMax: 5,
    format: 'webm',
  },
});

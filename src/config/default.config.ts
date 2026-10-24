import { createConfig, ms } from '#nori/structures/data/configuration.js';
import { env } from '#nori/env.js';

export default createConfig({
  prefix: '-',
  locale: 'en-US',
  color: 0xDB0912,
  developerIds: ['1562066443707617281'],
  presence: {
    status: 'dnd',
    texts: ['lost in my own world'],
  },
  links: {
    website: 'https://noribot.website/',
    invite: 'https://web.fluxer.app/oauth2/authorize?client_id=1562075950991020032&scope=bot&permissions=18014673390914888',
  },
  clusters: [
    {
      name: 'Valhalla',
      totalShards: 2,
      shardIds: [0],
      shardsPerProcess: 1,
      spawnDelay: ms('5s'),
      spawnTimeout: ms('30s'),
    },
    {
      name: 'Ragnarok',
      totalShards: 2,
      shardIds: [1],
      shardsPerProcess: 1,
      spawnDelay: ms('5s'),
      spawnTimeout: ms('30s'),
    },
  ],
  channels: {
    guildsId: '1563091515159359488',
    errorsId: '1562699833427374081',
  },
  music: {
    defaultSearchPlatform: 'spsearch',
    defaultVolume: 100,
    maxPlaylistTracks: 100,
    disconnectTime: ms('90s'),
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

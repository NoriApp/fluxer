import type { Locale } from '#nori/lib/category.js';

export type SearchPlatform = 'spsearch' | 'ytsearch' | 'scsearch';

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';

export type NodeConfig = {
  id: string;
  host: string;
  port: number;
  authorization: string;
  secure: boolean;
  retryAmount: number;
  retryDelay: number;
  requestSignalTimeoutMS: number;
  enableTrackStreamEndpoint?: boolean;
  enableLoadStreamEndpoint?: boolean;
};

export type ClusterConfig = {
  name: string;
  totalShards: number;
  shardIds: number[];
  shardsPerProcess: number;
  spawnDelay: number;
  spawnTimeout: number;
};

export type Config = {
  prefix: string;
  locale: Locale;
  color: number;
  developerIds: string[];
  presence: {
    status: PresenceStatus;
    texts: string[];
  };
  links: {
    website: string;
  };
  clusters: ClusterConfig[];
  channels: {
    guildsId: string;
    errorsId: string;
  };
  music: {
    defaultSearchPlatform: SearchPlatform;
    defaultVolume: number;
    maxPlaylistTracks: number;
    disconnectTime: number;
  };
  nodes: NodeConfig[];
  audio: {
    binaryDir: string;
    sources: SearchPlatform[];
    searchLimit: number;
    socketTimeout: number;
    timeout: number;
    maxBuffer: number;
    match: {
      exactSeconds: number;
      nearSeconds: number;
      farSeconds: number;
    };
  };
  encoder: {
    bitrate: string;
    sampleRate: number;
    channels: number;
    reconnectDelayMax: number;
    format: string;
  };
};

const UNITS = {
  ms: 1,
  s: 1000,
  sec: 1000,
  m: 60_000,
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

type Unit = keyof typeof UNITS;

export const ms = (value: `${number}${Unit}`) => {
  const match = /^(\d+(?:\.\d+)?)(ms|sec|min|s|m|h|d)$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);

  return Math.round(Number(match[1]) * UNITS[match[2] as Unit]);
};

export const createConfig = <const T extends Config>(config: T) => config;

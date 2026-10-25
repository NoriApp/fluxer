import { voiceManager } from '#base';

export type SearchOptions = {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  query: string;
  requester: unknown;
};

export type Requester = {
  id: string;
  username: string;
};

export type QueueTrack = {
  info: any;
  title: string;
  author: string;
  uri: string | null;
  duration: number;
  artworkUrl: string | null;
  requester: Requester;
  raw: FoundTrack;
};

export type GuildQueue = {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  tracks: QueueTrack[];
  current: QueueTrack | null;
  volume: number;
  busy: boolean;
  ownerId: string;
  idleTimer: NodeJS.Timeout | null;
  aloneTimer: NodeJS.Timeout | null;
  aloneSeen: boolean;
  aloneWatcher: NodeJS.Timeout | null;
  paused: boolean;
  position: number;
  playhead: (() => number) | null;
  resume: ((replay: boolean) => void) | null;
  resumeSignal: Promise<boolean> | null;
  skip: (() => void) | null;
  connection: Awaited<ReturnType<typeof voiceManager.join>> | null;
};

export type EnqueueOptions = {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  tracks: QueueTrack[];
};

export type FoundTrack = {
  encoded: string;
  info: {
    identifier: string;
    title: string;
    author: string;
    duration: number;
    uri: string | null;
    artworkUrl: string | null;
    isStream: boolean;
    sourceName: string;
    [key: string]: unknown;
  };
  pluginInfo?: unknown;
};

export type SearchOutput = {
  playlist: string | null;
  artworkUrl: string | null;
  tracks: FoundTrack[];
};

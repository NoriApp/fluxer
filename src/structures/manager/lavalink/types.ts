import { voiceManager } from '#base';
import { type Player } from 'lavalink-client';

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
  busy: boolean;
  idleTimer: NodeJS.Timeout | null;
  skip: (() => void) | null;
  connection: Awaited<ReturnType<typeof voiceManager.join>> | null;
};

export type EnqueueOptions = {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  tracks: QueueTrack[];
};

export type FoundTrack = Awaited<ReturnType<Player['search']>>['tracks'][number];

export type SearchOutput = {
  playlist: string | null;
  artworkUrl: string | null;
  tracks: FoundTrack[];
};

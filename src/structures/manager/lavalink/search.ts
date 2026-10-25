import config from '#nori/config/default.config.js';
import {
  type FoundTrack,
  type QueueTrack,
  type Requester,
  type SearchOptions,
  type SearchOutput,
} from './types.js';
import { nodeAccess } from './node.js';

const REQUEST_TIMEOUT_MS = 30000;

type LoadResult = {
  loadType?: string;
  data?: any;
};

const loadTracks = async (identifier: string, guildId: string): Promise<LoadResult> => {
  const node = nodeAccess();

  const response = await fetch(
    `${node.baseUrl}/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`,
    {
      headers: { ...node.headers, 'Guild-Id': guildId },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) throw new Error(`loadtracks status ${response.status}`);

  return (await response.json()) as LoadResult;
};

const normalize = (item: any): FoundTrack | null => {
  const info = item?.info;

  if (typeof item?.encoded !== 'string' || !info) return null;

  return {
    encoded: item.encoded,
    info: {
      ...info,
      title: String(info.title ?? ''),
      author: String(info.author ?? ''),
      duration: Number(info.length ?? info.duration ?? 0),
      uri: info.uri ?? null,
      artworkUrl: info.artworkUrl ?? null,
      isStream: Boolean(info.isStream),
      sourceName: String(info.sourceName ?? ''),
    },
    pluginInfo: item.pluginInfo,
  };
};

const toTracks = (list: unknown): FoundTrack[] =>
  (Array.isArray(list) ? list : []).map(normalize).filter((track): track is FoundTrack => track !== null);

export const searchTrack = async ({ guildId, query }: SearchOptions): Promise<SearchOutput> => {
  const isUrl = /^https?:\/\//i.test(query);

  const identifiers = isUrl
    ? [query]
    : [...new Set([config.music.defaultSearchPlatform, 'ytmsearch', 'ytsearch'])].map(
        (platform) => `${platform}:${query}`,
      );

  let lastError: Error | null = null;

  for (const identifier of identifiers) {
    let result: LoadResult;

    try {
      result = await loadTracks(identifier, guildId);
    } catch (error) {
      lastError = error as Error;
      continue;
    }

    if (result.loadType === 'playlist') {
      const tracks = toTracks(result.data?.tracks).slice(0, config.music.maxPlaylistTracks);

      if (tracks.length === 0) continue;

      return {
        playlist: String(result.data?.info?.name ?? 'Playlist'),
        artworkUrl: result.data?.pluginInfo?.artworkUrl ?? result.data?.info?.artworkUrl ?? tracks[0].info.artworkUrl,
        tracks,
      };
    }

    const tracks = toTracks(result.loadType === 'track' ? [result.data] : result.data);

    if (tracks.length > 0) return { playlist: null, artworkUrl: null, tracks: tracks.slice(0, 1) };
  }

  if (lastError) throw lastError;

  return { playlist: null, artworkUrl: null, tracks: [] };
};

export const toQueueTrack = (track: FoundTrack, requester: Requester): QueueTrack => ({
  info: track.info,
  title: track.info.title,
  author: track.info.author ?? '',
  uri: track.info.uri ?? null,
  duration: track.info.duration ?? 0,
  artworkUrl: track.info.artworkUrl ?? null,
  requester,
  raw: track,
});

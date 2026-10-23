import config from '#nori/config/default.config.js';
import {
  type FoundTrack,
  type QueueTrack,
  type Requester,
  type SearchOptions,
  type SearchOutput,
} from './types.js';
import { state } from './state.js';

export const searchTrack = async ({
  guildId,
  voiceChannelId,
  textChannelId,
  query,
  requester,
}: SearchOptions): Promise<SearchOutput> => {
  if (!state.manager) throw new Error('Lavalink is not ready.');

  const player = state.manager.createPlayer({
    guildId,
    voiceChannelId,
    textChannelId,
    node: config.nodes[0].id,
  });

  try {
    const isUrl = /^https?:\/\//i.test(query);

    const result = await player.search(
      isUrl ? { query } : { query, source: config.music.defaultSearchPlatform },
      requester,
    );

    if (result.loadType === 'playlist') {
      return {
        playlist: result.playlist?.title ?? result.playlist?.name ?? 'Playlist',
        artworkUrl: result.playlist?.thumbnail ?? null,
        tracks: result.tracks.slice(0, config.music.maxPlaylistTracks),
      };
    }

    return { playlist: null, artworkUrl: null, tracks: result.tracks.slice(0, 1) };
  } finally {
    await player.destroy().catch(() => null);
  }
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

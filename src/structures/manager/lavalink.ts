import { EmbedBuilder, VoiceChannel } from '@fluxerjs/core';
import { LavalinkManager, type Player } from 'lavalink-client';
import { client, voiceManager } from '#base';
import config from '#nori/config/default.config.js';
import { sendNowPlaying } from '#nori/fluxer/canvas/files/track.js';
import {
  type AudioSource,
  type NodeAccess,
  openTrackstream,
  pcmToWebm,
  prepareVoice,
  releaseVoice,
} from '#nori/structures/manager/audio.js';
import {
  createPcmStream,
  createTranscoder,
  diagnoseYtDlp,
  rankCandidates,
  resolveAudioUrl,
  stopEncoder,
} from '#nori/structures/manager/yt-dlp.js';

const DEBUG = process.env.NORI_DEBUG !== '0';

const dbg = (scope: string, ...args: unknown[]) => {
  if (DEBUG) console.log(`[Nori][debug][${scope}]`, ...args);
};

const short = (value: string | null | undefined, max = 90) => {
  if (!value) return '(empty)';
  return value.length > max ? `${value.slice(0, max)}…(${value.length} chars)` : value;
};

const hostOf = (value: string) => {
  try {
    return new URL(value).host;
  } catch {
    return '(invalid url)';
  }
};

const elapsed = (since: number) => `${Date.now() - since}ms`;

type SearchOptions = {
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

type EnqueueOptions = {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  tracks: QueueTrack[];
};

let manager: LavalinkManager | null = null;

const queues = new Map<string, GuildQueue>();

export const initLavalink = async (user: { id: string; username: string }) => {
  dbg('init', `creating manager for ${user.username} (${user.id}), nodes: ${config.nodes.length}`);

  manager = new LavalinkManager({
    nodes: config.nodes.map((node) => ({ ...node })),
    sendToShard: () => {},
    autoSkip: false,
    client: { id: user.id, username: user.username },
  });

  manager.nodeManager.on('connect', (node) => {
    console.log(`[Nori] Node ${node.id} connected.`);
    dbg('node', `connect id=${node.id} sessionId=${(node as any).sessionId ?? '(none)'}`);
  });

  manager.nodeManager.on('disconnect', (node, reason: any) => {
    dbg('node', `disconnect id=${node.id} reason=${JSON.stringify(reason)}`);
  });

  manager.nodeManager.on('error', (node, error) => {
    console.error(`[Nori] Node ${node.id} error:`, error.message);
    dbg('node', `error id=${node.id}`, error);
  });

  await manager.init({ id: user.id, username: user.username });

  dbg('init', 'manager.init finished');

  if (process.env.NORI_DIAG !== '0') void diagnoseYtDlp();

  return manager;
};

export const isLavalinkReady = () => manager !== null;

type FoundTrack = Awaited<ReturnType<Player['search']>>['tracks'][number];

export type SearchOutput = {
  playlist: string | null;
  artworkUrl: string | null;
  tracks: FoundTrack[];
};

export const searchTrack = async ({
  guildId,
  voiceChannelId,
  textChannelId,
  query,
  requester,
}: SearchOptions): Promise<SearchOutput> => {
  if (!manager) throw new Error('Lavalink is not ready.');

  const started = Date.now();
  dbg('search', `guild=${guildId} query="${short(query, 120)}"`);

  const player = manager.createPlayer({
    guildId,
    voiceChannelId,
    textChannelId,
    node: config.nodes[0].id,
  });

  try {
    const isUrl = /^https?:\/\//i.test(query);
    dbg('search', `isUrl=${isUrl} source=${isUrl ? '(url)' : config.music.defaultSearchPlatform}`);

    const result = await player.search(
      isUrl ? { query } : { query, source: config.music.defaultSearchPlatform },
      requester,
    );

    dbg(
      'search',
      `loadType=${result.loadType} tracks=${result.tracks.length} took=${elapsed(started)}`,
    );

    if (result.loadType === 'playlist') {
      return {
        playlist: result.playlist?.title ?? result.playlist?.name ?? 'Playlist',
        artworkUrl: result.playlist?.thumbnail ?? null,
        tracks: result.tracks.slice(0, config.music.maxPlaylistTracks),
      };
    }

    return { playlist: null, artworkUrl: null, tracks: result.tracks.slice(0, 1) };
  } catch (error) {
    dbg('search', 'failed:', (error as Error)?.message ?? error);
    throw error;
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

export const getQueue = (guildId: string) => queues.get(guildId) ?? null;

const notify = async (channelId: string, description: string) => {
  const embed = new EmbedBuilder().setColor(config.color).setDescription(description);
  await client.channels.send(channelId, { embeds: [embed] }).catch(() => null);
};

const clearIdle = (queue: GuildQueue) => {
  if (!queue.idleTimer) return;
  clearTimeout(queue.idleTimer);
  queue.idleTimer = null;
  dbg('idle', `guild=${queue.guildId} timer cleared`);
};

const scheduleIdle = (queue: GuildQueue) => {
  if (queues.get(queue.guildId) !== queue) return;

  clearIdle(queue);

  dbg('idle', `guild=${queue.guildId} leaving in ${config.music.disconnectTime}ms`);

  queue.idleTimer = setTimeout(() => {
    if (queues.get(queue.guildId) !== queue) return;

    dbg('idle', `guild=${queue.guildId} idle timeout reached, leaving voice`);
    queues.delete(queue.guildId);
    queue.connection = null;
    voiceManager.leave(queue.guildId);
  }, config.music.disconnectTime);
};

const nodeAccess = (): NodeAccess => {
  const node = config.nodes[0];
  const protocol = node.secure ? 'https' : 'http';
  const sessionId = (manager?.nodeManager.nodes.get(node.id) as any)?.sessionId as string | undefined;

  const access: NodeAccess = {
    baseUrl: `${protocol}://${node.host}:${node.port}`,
    headers: {
      Authorization: node.authorization,
      'Client-Name': 'Nori/1.0.0',
      ...(sessionId ? { 'Session-Id': sessionId } : {}),
    },
  };

  dbg('node', `access baseUrl=${access.baseUrl} sessionId=${sessionId ?? '(none)'}`);

  return access;
};

const probeHls = async (url: string) => {
  const scope = 'probe';

  try {
    const manifest = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const text = await manifest.text();

    dbg(
      scope,
      `manifest status=${manifest.status} type=${manifest.headers.get('content-type')} bytes=${text.length}`,
    );

    if (!manifest.ok) {
      dbg(scope, `manifest body: ${short(text.replace(/\s+/g, ' '), 200)}`);
      return;
    }

    const playlistUrl = text.split('\n').find((line) => line.startsWith('http'));
    if (!playlistUrl) {
      dbg(scope, 'no variant playlist url found in manifest');
      return;
    }

    const playlistResponse = await fetch(playlistUrl, { signal: AbortSignal.timeout(8000) });
    const playlist = await playlistResponse.text();

    dbg(scope, `playlist status=${playlistResponse.status} bytes=${playlist.length}`);

    const segmentUrl = playlist.split('\n').find((line) => line.startsWith('http'));
    if (!segmentUrl) {
      dbg(scope, 'no segment url found in playlist');
      return;
    }

    const segment = await fetch(segmentUrl, { signal: AbortSignal.timeout(8000) });
    const bytes = Buffer.from(await segment.arrayBuffer());

    dbg(
      scope,
      `segment status=${segment.status} type=${segment.headers.get('content-type')} size=${bytes.length} first8=${bytes.subarray(0, 8).toString('hex')} (TS valido comeca com 47)`,
    );
  } catch (error) {
    dbg(scope, 'probe failed:', (error as Error)?.message ?? error);
  }
};

type LoadstreamOverride = {
  encoded: string;
  label: string;
  firstTimeout: number;
};

const openLoadstream = async (
  guildId: string,
  track: QueueTrack,
  startMs = 0,
  splice = false,
  override?: LoadstreamOverride,
): Promise<AudioSource | null> => {
  const encoded = override?.encoded ?? ((track.raw as any).encoded as string | undefined);
  if (!encoded) {
    dbg('loadstream', 'track has no encoded data, skipping');
    return null;
  }

  const started = Date.now();
  const node = nodeAccess();

  dbg('loadstream', `opening for "${track.title}" expectedMs=${track.duration}`);

  const pcm = await createPcmStream(
    guildId,
    `${node.baseUrl}/v4/loadstream?encodedTrack=${encodeURIComponent(encoded)}`,
    {
      headers: node.headers,
      expectedMs: track.duration,
      startMs,
      splice,
      firstTimeout: override?.firstTimeout,
    },
  );

  dbg('loadstream', `first pcm chunk ready after ${elapsed(started)}`);

  const stream = pcmToWebm(pcm.stream);

  return {
    label: override?.label ?? (splice ? 'loadstream (resumed)' : 'loadstream (pcm -> opus)'),
    stream,
    fedMs: pcm.fedMs,
    startMs,
    close: () => {
      dbg('loadstream', `close guild=${guildId} fedMs=${pcm.fedMs()}`);
      stream.destroy();
      stopEncoder(guildId);
    },
  };
};

type NodeCandidate = {
  encoded: string;
  url: string;
  title: string;
  uploader: string;
  duration: number;
};

const NODE_YT_PREFIXES = ['ytmsearch', 'ytsearch'];
const NODE_YT_CANDIDATES = 3;
const NODE_YT_FIRST_TIMEOUT = 12000;

const searchNodeYoutube = async (guildId: string, track: QueueTrack): Promise<NodeCandidate[]> => {
  const node = nodeAccess();
  const cleanTitle = track.title.replace(/\(.*?\)|\[.*?\]/g, ' ');
  const query = `${track.author} ${cleanTitle}`.replace(/\s+/g, ' ').trim();

  const lists = await Promise.all(
    NODE_YT_PREFIXES.map(async (prefix) => {
      try {
        const response = await fetch(
          `${node.baseUrl}/v4/loadtracks?identifier=${encodeURIComponent(`${prefix}:${query}`)}`,
          {
            headers: { ...node.headers, 'Guild-Id': guildId },
            signal: AbortSignal.timeout(15000),
          },
        );

        if (!response.ok) {
          dbg('nodelink-yt', `${prefix} status=${response.status}`);
          return [] as any[];
        }

        const body = (await response.json()) as any;
        const data = body?.data;
        const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.tracks) ? data.tracks : [];

        dbg('nodelink-yt', `${prefix} loadType=${body?.loadType} tracks=${list.length}`);

        return list;
      } catch (error) {
        dbg('nodelink-yt', `${prefix} failed:`, (error as Error)?.message ?? error);
        return [] as any[];
      }
    }),
  );

  const seen = new Set<string>();
  const candidates: NodeCandidate[] = [];

  for (const item of lists.flat()) {
    const info = item?.info;
    const encoded = item?.encoded;
    const url = info?.uri;

    if (typeof encoded !== 'string' || typeof url !== 'string' || info?.isStream) continue;
    if (url === track.uri || seen.has(url)) continue;

    seen.add(url);

    candidates.push({
      encoded,
      url,
      title: String(info.title ?? ''),
      uploader: String(info.author ?? ''),
      duration: Number(info.length ?? info.duration ?? 0) / 1000,
    });
  }

  return rankCandidates(
    candidates,
    { title: track.title, author: track.author, duration: track.duration },
    NODE_YT_CANDIDATES,
  );
};

const openNodeYoutube = async (
  guildId: string,
  track: QueueTrack,
  startMs: number,
  cancelled: () => boolean,
): Promise<AudioSource | null> => {
  const started = Date.now();
  const candidates = await searchNodeYoutube(guildId, track);

  dbg('nodelink-yt', `${candidates.length} candidate(s) after ${elapsed(started)}`);

  for (const candidate of candidates) {
    if (cancelled()) return null;

    dbg(
      'nodelink-yt',
      `trying "${candidate.title}" by "${candidate.uploader}" duration=${candidate.duration}s url=${short(candidate.url)}`,
    );

    const source = await openLoadstream(guildId, track, startMs, false, {
      encoded: candidate.encoded,
      label: 'nodelink youtube (pcm -> opus)',
      firstTimeout: NODE_YT_FIRST_TIMEOUT,
    }).catch((error: Error) => {
      console.error(`[Nori] nodelink youtube candidate failed: ${error.message}`);
      return null;
    });

    if (source) return source;
  }

  return null;
};

const openTranscode = async (
  guildId: string,
  url: string,
  expectedMs: number,
  label: string,
  startMs = 0,
): Promise<AudioSource | null> => {
  const started = Date.now();

  dbg('transcode', `opening label="${label}" host=${hostOf(url)} url=${short(url)} expectedMs=${expectedMs} startMs=${startMs}`);

  const pcm = await createTranscoder(guildId, url, expectedMs, startMs);

  dbg('transcode', `first pcm chunk ready after ${elapsed(started)}`);

  const stream = pcmToWebm(pcm.stream);

  return {
    label,
    stream,
    fedMs: pcm.fedMs,
    startMs,
    close: () => {
      dbg('transcode', `close guild=${guildId} label="${label}" fedMs=${pcm.fedMs()}`);
      stream.destroy();
      stopEncoder(guildId);
    },
  };
};

const openYtDlp = async (
  guildId: string,
  track: QueueTrack,
  startMs = 0,
): Promise<AudioSource | null> => {
  const started = Date.now();

  dbg(
    'yt-dlp',
    `resolving "${track.title}" by "${track.author}" uri=${short(track.uri)} duration=${track.duration}`,
  );

  const url = await resolveAudioUrl(track.info);

  if (!url) {
    dbg('yt-dlp', `no url resolved after ${elapsed(started)}`);
    return null;
  }

  dbg('yt-dlp', `resolved after ${elapsed(started)} host=${hostOf(url)} url=${short(url)}`);

  return openTranscode(guildId, url, track.duration, 'yt-dlp + ffmpeg', startMs);
};

type PlayResult = 'finished' | 'failed' | 'skipped';

const playSource = (queue: GuildQueue, connection: any, track: QueueTrack, source: AudioSource) =>
  new Promise<PlayResult>((resolve) => {
    const startedAt = Date.now();
    let begunAt = startedAt;
    let timer: NodeJS.Timeout | null = null;
    let started = false;
    let done = false;

    dbg(
      'play',
      `playSource "${track.title}" via ${source.label} mode=${source.url ? 'url' : 'stream'}`,
    );

    const finish = (result: PlayResult = 'finished') => {
      if (done) return;
      done = true;

      dbg(
        'play',
        `finish result=${result} started=${started} after=${elapsed(startedAt)} fedMs=${source.fedMs?.() ?? 'n/a'}`,
      );

      if (timer) clearTimeout(timer);
      queue.skip = null;

      source.close();
      releaseVoice(connection);
      resolve(result);
    };

    const waitRemaining = () => {
      if (done || timer) return;

      const total = source.fedMs ? source.fedMs() - (source.startMs ?? 0) + 800 : track.duration;
      const remaining = total > 0 ? Math.max(0, total - (Date.now() - begunAt)) : 0;

      dbg('play', `waitRemaining total=${total}ms remaining=${remaining}ms`);

      timer = setTimeout(() => finish(), remaining);
    };

    queue.skip = () => {
      dbg('play', `skip requested for "${track.title}"`);
      finish('skipped');
    };

    const stream = source.stream;

    if (stream) {
      stream.once('error', (error) => {
        console.error(`[Nori] ${source.label} stream error:`, error.message);
        dbg('play', `stream error started=${started}`, error);
        finish(started ? 'finished' : 'failed');
      });

      stream.once('end', () => {
        console.log(
          `[Nori] stream ended after ${Math.round((Date.now() - startedAt) / 1000)}s of ${Math.round(track.duration / 1000)}s for "${track.title}"`,
        );
        waitRemaining();
      });

      stream.once('close', () => {
        dbg('play', `stream closed after ${elapsed(startedAt)}`);
      });
    }

    dbg('play', 'calling connection.play()');

    connection
      .play(source.url ?? stream)
      .then(() => {
        if (done) return;

        started = true;
        begunAt = Date.now();
        queue.current = track;

        dbg('play', `connection.play() resolved after ${elapsed(startedAt)}`);

        sendNowPlaying({
          guildId: queue.guildId,
          textChannelId: queue.textChannelId,
          track,
        }).catch((error: unknown) => {
          dbg('play', 'sendNowPlaying failed:', (error as Error)?.message ?? error);
        });

        if (source.url) waitRemaining();
      })
      .catch((error: unknown) => {
        console.error(`[Nori] ${source.label} play failed:`, (error as Error)?.message ?? error);
        dbg('play', `connection.play() rejected started=${started}`, error);
        finish(started ? 'finished' : 'failed');
      });
  });

const playTrack = async (queue: GuildQueue, track: QueueTrack) => {
  const trackStarted = Date.now();

  dbg(
    'track',
    `start "${track.title}" by "${track.author}" guild=${queue.guildId} duration=${track.duration} uri=${short(track.uri)}`,
  );

  const channel = client.channels.get(queue.voiceChannelId);
  if (!(channel instanceof VoiceChannel)) throw new Error('Voice channel not found.');

  if (!queue.connection) {
    dbg('voice', `joining channel ${queue.voiceChannelId}`);
    const joinStarted = Date.now();
    queue.connection = await voiceManager.join(channel);
    dbg('voice', `joined in ${elapsed(joinStarted)}`);
  } else {
    dbg('voice', 'reusing existing connection');
  }

  const connection = queue.connection;

  let skipped = false;
  const markSkipped = () => {
    dbg('track', `skip flag set for "${track.title}"`);
    skipped = true;
    stopEncoder(queue.guildId);
  };

  queue.skip = markSkipped;

  await prepareVoice(connection);
  dbg('voice', 'prepareVoice done');

  const encoded = (track.raw as any).encoded as string | undefined;

  dbg('track', `encoded present=${!!encoded}`);

  // Position (ms) where a previous source died early; later sources resume from here.
  let resumeFrom = 0;

  const attempts: Array<[string, () => Promise<AudioSource | null>]> = [];

  if (encoded) {
    attempts.push(
      [
        'trackstream',
        async () => {
          const direct = await openTrackstream(
            nodeAccess(),
            { encoded, uri: track.uri, duration: track.duration },
            queue.guildId,
          );

          if (!direct) {
            dbg('trackstream', 'openTrackstream returned null');
            return null;
          }

          dbg(
            'trackstream',
            `label="${direct.label}" url=${direct.url ? short(direct.url) : '-'} transcodeUrl=${direct.transcodeUrl ? short(direct.transcodeUrl) : '-'}`,
          );

          if (!direct.transcodeUrl) return direct;

          if (/mpegts|\.m3u8/i.test(`${direct.label} ${direct.transcodeUrl}`)) {
            console.log('[Nori] trackstream returned HLS, skipping to next source.');
            dbg('trackstream', 'HLS detected, running probe in background and skipping ffmpeg');

            if (DEBUG) void probeHls(direct.transcodeUrl);

            return null;
          }

          return openTranscode(queue.guildId, direct.transcodeUrl, track.duration, direct.label);
        },
      ],
      ['loadstream', () => openLoadstream(queue.guildId, track)],
    );
  }

  attempts.push([
    'nodelink-youtube',
    () => openNodeYoutube(queue.guildId, track, resumeFrom, () => skipped),
  ]);

  attempts.push(['yt-dlp', () => openYtDlp(queue.guildId, track, resumeFrom)]);

  // Last resort: yt-dlp failed, so continue with loadstream ?position= (may be
  // imprecise at the seam, but better than the song stopping halfway).
  if (encoded) {
    attempts.push([
      'loadstream-resume',
      async () => (resumeFrom > 0 ? openLoadstream(queue.guildId, track, resumeFrom, true) : null),
    ]);
  }

  dbg('track', `attempt order: ${attempts.map(([name]) => name).join(' -> ')}`);

  for (const [name, open] of attempts) {
    if (skipped) {
      dbg('track', `skipped flag set, aborting before "${name}"`);
      break;
    }

    queue.skip = markSkipped;

    const attemptStarted = Date.now();
    dbg('track', `attempt "${name}" starting`);

    const source = await open().catch((error: Error) => {
      console.error(`[Nori] ${name} failed:`, error.message);
      dbg('track', `attempt "${name}" threw after ${elapsed(attemptStarted)}`, error);
      return null;
    });

    if (!source) {
      dbg('track', `attempt "${name}" gave no source after ${elapsed(attemptStarted)}`);
      continue;
    }

    dbg('track', `attempt "${name}" opened source after ${elapsed(attemptStarted)}`);

    if (skipped) {
      source.close();
      break;
    }

    console.log(`[Nori] Playing "${track.title}" via ${source.label}.`);

    // If loadstream ends early, warm the yt-dlp URL cache while the buffered audio
    // is still playing, so the fallback starts with no gap.
    if (name === 'loadstream' && source.stream && track.duration > 0) {
      source.stream.once('end', () => {
        if ((source.fedMs?.() ?? 0) < track.duration * 0.97) {
          dbg('track', `loadstream ended early, pre-resolving yt-dlp for "${track.title}"`);
          void resolveAudioUrl(track.info).catch(() => null);
        }
      });
    }

    const result = await playSource(queue, connection, track, source);

    dbg('track', `attempt "${name}" playSource result=${result}`);

    if (result === 'skipped') {
      dbg('track', `"${track.title}" skipped by user after ${elapsed(trackStarted)}`);
      return;
    }

    if (result === 'finished') {
      const fed = source.fedMs?.() ?? 0;
      const cutShort = track.duration > 0 && fed > 0 && fed < track.duration * 0.97;

      if (!cutShort) {
        dbg('track', `done "${track.title}" in ${elapsed(trackStarted)}`);
        return;
      }

      resumeFrom = fed;
      console.warn(`[Nori] "${track.title}" cut short at ${fed}ms of ${track.duration}ms, falling back.`);
    }
  }

  queue.skip = null;

  if (resumeFrom > 0 && !skipped) {
    dbg('track', `"${track.title}" ended early at ${resumeFrom}ms, no fallback left`);
    return;
  }

  if (!skipped) {
    dbg('track', `all attempts failed for "${track.title}" after ${elapsed(trackStarted)}`);
    throw new Error('Audio source not found.');
  }

  dbg('track', `"${track.title}" ended by skip after ${elapsed(trackStarted)}`);
};

const run = async (queue: GuildQueue) => {
  if (queue.busy) {
    dbg('queue', `guild=${queue.guildId} already running, ignoring run()`);
    return;
  }

  queue.busy = true;
  clearIdle(queue);

  dbg('queue', `guild=${queue.guildId} run loop start, tracks=${queue.tracks.length}`);

  while (true) {
    while (queue.tracks.length > 0) {
      const track = queue.tracks.shift()!;

      dbg('queue', `guild=${queue.guildId} next "${track.title}" (remaining=${queue.tracks.length})`);

      try {
        await playTrack(queue, track);
      } catch (error) {
        console.error(`[Nori] playTrack failed for "${track.title}":`, (error as Error)?.message ?? error);
        dbg('queue', 'playTrack error detail', error);
        await notify(queue.textChannelId, `Não consegui tocar **${track.title}**.`);
      }
    }

    queue.current = null;

    if (queue.tracks.length === 0) break;
  }

  queue.busy = false;

  dbg('queue', `guild=${queue.guildId} run loop finished`);

  scheduleIdle(queue);
};

export const enqueue = ({ guildId, voiceChannelId, textChannelId, tracks }: EnqueueOptions) => {
  let queue = queues.get(guildId);

  if (!queue) {
    dbg('queue', `guild=${guildId} creating new queue`);

    queue = {
      guildId,
      voiceChannelId,
      textChannelId,
      tracks: [],
      current: null,
      busy: false,
      idleTimer: null,
      skip: null,
      connection: null,
    };

    queues.set(guildId, queue);
  }

  queue.voiceChannelId = voiceChannelId;
  queue.textChannelId = textChannelId;

  clearIdle(queue);
  queue.tracks.push(...tracks);

  dbg(
    'queue',
    `guild=${guildId} enqueued ${tracks.length} track(s), total waiting=${queue.tracks.length}, busy=${queue.busy}`,
  );

  run(queue).catch((error) => {
    console.error('[Nori] queue run crashed:', (error as Error)?.message ?? error);
    dbg('queue', 'run() crash detail', error);
    queue.busy = false;
  });
};

export const skipTrack = (guildId: string) => {
  const queue = queues.get(guildId);

  if (!queue?.skip) {
    dbg('queue', `guild=${guildId} skipTrack: nothing to skip`);
    return false;
  }

  dbg('queue', `guild=${guildId} skipTrack`);
  queue.skip();
  return true;
};

export const stopQueue = (guildId: string) => {
  const queue = queues.get(guildId);

  if (!queue) {
    dbg('queue', `guild=${guildId} stopQueue: no queue`);
    return false;
  }

  dbg('queue', `guild=${guildId} stopQueue clearing ${queue.tracks.length} track(s)`);

  queue.tracks.length = 0;
  queue.skip?.();
  return true;
};

export const destroyQueue = (guildId: string) => {
  const queue = queues.get(guildId);

  if (!queue) {
    dbg('queue', `guild=${guildId} destroyQueue: no queue`);
    return false;
  }

  dbg('queue', `guild=${guildId} destroyQueue clearing ${queue.tracks.length} track(s) and leaving voice`);

  queues.delete(guildId);
  clearIdle(queue);

  queue.tracks.length = 0;
  queue.skip?.();
  queue.current = null;
  queue.connection = null;

  Promise.resolve(voiceManager.leave(guildId)).catch(() => null);

  return true;
};

export type NodeStatus = {
  id: string;
  online: boolean;
  latency: number | null;
  players: number;
  playingPlayers: number;
  uptime: number;
  cpuLoad: number;
  memoryUsed: number;
  memoryAllocated: number;
};

export const getNodeStatus = async (): Promise<NodeStatus> => {
  const node = config.nodes[0];
  const protocol = node.secure ? 'https' : 'http';
  const started = Date.now();

  const offline: NodeStatus = {
    id: node.id,
    online: false,
    latency: null,
    players: 0,
    playingPlayers: 0,
    uptime: 0,
    cpuLoad: 0,
    memoryUsed: 0,
    memoryAllocated: 0,
  };

  try {
    const response = await fetch(`${protocol}://${node.host}:${node.port}/v4/stats`, {
      headers: {
        Authorization: node.authorization,
        'Client-Name': 'Nori/1.0.0',
      },
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - started;

    dbg('stats', `status=${response.status} latency=${latency}ms`);

    if (!response.ok) return { ...offline, latency };

    const data = (await response.json()) as any;

    return {
      id: node.id,
      online: true,
      latency,
      players: Number(data.players ?? 0),
      playingPlayers: Number(data.playingPlayers ?? 0),
      uptime: Number(data.uptime ?? 0),
      cpuLoad: Number(data.cpu?.nodelinkLoad ?? data.cpu?.lavalinkLoad ?? 0),
      memoryUsed: Number(data.memory?.used ?? 0),
      memoryAllocated: Number(data.memory?.allocated ?? 0),
    };
  } catch (error) {
    dbg('stats', 'request failed:', (error as Error)?.message ?? error);
    return offline;
  }
};

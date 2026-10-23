import {
  createPcmStream,
  stopEncoder,
  rankCandidates,
  createTranscoder,
  resolveAudioUrl,
} from '#nori/structures/manager/yt-dlp.js';
import { pcmToWebm, type AudioSource } from '#nori/structures/manager/audio.js';
import { type QueueTrack } from './types.js';
import { nodeAccess } from './node.js';

type LoadstreamOverride = {
  encoded: string;
  label: string;
  firstTimeout: number;
};

export const openLoadstream = async (
  guildId: string,
  track: QueueTrack,
  startMs = 0,
  splice = false,
  override?: LoadstreamOverride,
): Promise<AudioSource | null> => {
  const encoded = override?.encoded ?? ((track.raw as any).encoded as string | undefined);
  if (!encoded) {
    return null;
  }

  const node = nodeAccess();

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

  const stream = pcmToWebm(pcm.stream);

  return {
    label: override?.label ?? (splice ? 'loadstream (resumed)' : 'loadstream (pcm -> opus)'),
    stream,
    fedMs: pcm.fedMs,
    startMs,
    close: () => {
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
          return [] as any[];
        }

        const body = (await response.json()) as any;
        const data = body?.data;
        const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.tracks) ? data.tracks : [];

        return list;
      } catch (error) {
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

export const openNodeYoutube = async (
  guildId: string,
  track: QueueTrack,
  startMs: number,
  cancelled: () => boolean,
): Promise<AudioSource | null> => {
  const candidates = await searchNodeYoutube(guildId, track);

  for (const candidate of candidates) {
    if (cancelled()) return null;

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

export const openTranscode = async (
  guildId: string,
  url: string,
  expectedMs: number,
  label: string,
  startMs = 0,
): Promise<AudioSource | null> => {

  const pcm = await createTranscoder(guildId, url, expectedMs, startMs);

  const stream = pcmToWebm(pcm.stream);

  return {
    label,
    stream,
    fedMs: pcm.fedMs,
    startMs,
    close: () => {
      stream.destroy();
      stopEncoder(guildId);
    },
  };
};

export const openYtDlp = async (
  guildId: string,
  track: QueueTrack,
  startMs = 0,
): Promise<AudioSource | null> => {

  const url = await resolveAudioUrl(track.info);

  if (!url) {
    return null;
  }

  return openTranscode(guildId, url, track.duration, 'yt-dlp + ffmpeg', startMs);
};

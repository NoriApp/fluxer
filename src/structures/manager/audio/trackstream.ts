import { Readable } from 'node:stream';
import { type AudioSource, type NodeAccess } from './types.js';

const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

const isOpusFormat = (format: string) => /webm|opus/i.test(format);

const youtubeWatchUrl = (uri: string | null) => {
  if (!uri) return null;

  try {
    const url = new URL(uri);
    const host = url.hostname.replace(/^(www|m|music)\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1);
      return id ? `https://www.youtube.com/watch?v=${id}` : null;
    }

    if (host === 'youtube.com') {
      const id = url.searchParams.get('v');
      return id ? `https://www.youtube.com/watch?v=${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
};

const getTrackstream = async (node: NodeAccess, encoded: string, guildId: string) => {
  const response = await fetch(
    `${node.baseUrl}/v4/trackstream?encodedTrack=${encodeURIComponent(encoded)}&itag=251`,
    {
      headers: { ...node.headers, 'Guild-Id': guildId },
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`trackstream status ${response.status} ${detail}`.trim());
  }

  const body = (await response.json()) as { url?: string; format?: string };
  if (typeof body?.url !== 'string' || !body.url) throw new Error('trackstream returned no url');

  return { url: body.url, format: String(body.format ?? '') };
};

const refreshEncoded = async (node: NodeAccess, uri: string | null, guildId: string) => {
  if (!uri || !/^https?:\/\//i.test(uri)) return null;

  const identifier = youtubeWatchUrl(uri) ?? uri;

  try {
    const response = await fetch(
      `${node.baseUrl}/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`,
      { headers: { ...node.headers, 'Guild-Id': guildId }, signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) return null;

    const body = (await response.json()) as any;
    const track = body?.data?.tracks?.[0] ?? body?.tracks?.[0] ?? body?.data;
    const encoded = track?.encoded ?? track?.data;

    return typeof encoded === 'string' ? encoded : null;
  } catch {
    return null;
  }
};

const looksLikeWebm = async (url: string) => {
  try {
    const response = await fetch(url, {
      headers: { Range: 'bytes=0-15' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || !response.body) return false;

    const reader = response.body.getReader();
    const { value } = await reader.read();
    await reader.cancel().catch(() => null);

    return !!value && value.length >= 4 && Buffer.from(value.subarray(0, 4)).equals(WEBM_MAGIC);
  } catch {
    return false;
  }
};

const openUrlStream = async (url: string): Promise<AudioSource> => {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });

  if (!response.ok || !response.body) throw new Error(`stream status ${response.status}`);

  const stream = Readable.fromWeb(response.body as any);
  stream.on('error', () => null);

  return {
    label: 'trackstream (stream)',
    stream,
    close: () => {
      controller.abort();
      stream.destroy();
    },
  };
};

export const openTrackstream = async (
  node: NodeAccess,
  track: { encoded: string; uri: string | null; duration: number },
  guildId: string,
): Promise<AudioSource | null> => {
  let encoded = track.encoded;
  let direct: { url: string; format: string } | null = null;

  const watch = youtubeWatchUrl(track.uri);

  if (watch && watch !== track.uri) {
    const fresh = await refreshEncoded(node, track.uri, guildId);
    if (fresh) encoded = fresh;
  }

  try {
    direct = await getTrackstream(node, encoded, guildId);
  } catch (error) {
    console.warn(`[Nori] trackstream failed (${(error as Error).message}), refreshing track...`);

    const fresh = await refreshEncoded(node, track.uri, guildId);
    if (!fresh) return null;

    encoded = fresh;
    direct = await getTrackstream(node, encoded, guildId).catch(() => null);
  }

  if (!direct) return null;

  if (!isOpusFormat(direct.format)) {
    const fresh = await refreshEncoded(node, track.uri, guildId);

    if (fresh) {
      const again = await getTrackstream(node, fresh, guildId).catch(() => null);
      if (again && isOpusFormat(again.format)) direct = again;
    }
  }

  if (!isOpusFormat(direct.format) && !(await looksLikeWebm(direct.url))) {
    console.log(`[Nori] trackstream format "${direct.format || '?'}" goes through ffmpeg (${track.uri ?? 'no uri'}).`);

    return {
      label: `trackstream (${direct.format || '?'} -> ffmpeg)`,
      transcodeUrl: direct.url,
      close: () => {},
    };
  }

  if (track.duration > 0) {
    return { label: 'trackstream (zero-copy)', url: direct.url, close: () => {} };
  }

  return openUrlStream(direct.url);
};

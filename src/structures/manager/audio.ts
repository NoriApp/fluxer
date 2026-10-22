import { Readable, Transform } from 'node:stream';
import prismMedia from 'prism-media';

const { Encoder: PrismOpusEncoder } = (prismMedia as any).opus;

export type NodeAccess = {
  baseUrl: string;
  headers: Record<string, string>;
};

export type AudioSource = {
  label: string;
  url?: string;
  transcodeUrl?: string;
  stream?: Readable;
  fedMs?: () => number;
  startMs?: number;
  close: () => void;
};

const OPUS_FRAME_MS = 20;
const BLOCKS_PER_CLUSTER = 50;
const CLUSTER_FLUSH_BYTES = 32 * 1024;

const hexCache = new Map<string, Buffer>();

const hexBuf = (hex: string) => {
  let buf = hexCache.get(hex);

  if (!buf) {
    buf = Buffer.from(hex, 'hex');
    hexCache.set(hex, buf);
  }

  return buf;
};

const sizeVint = (value: number) => {
  if (value <= 127) return Buffer.from([value | 0x80]);
  if (value <= 16383) return Buffer.from([((value >> 8) & 0xff) | 0x40, value & 0xff]);
  if (value <= 2097151) {
    return Buffer.from([((value >> 16) & 0xff) | 0x20, (value >> 8) & 0xff, value & 0xff]);
  }

  let length = 4;
  while (value > 2 ** (7 * length) - 1 && length < 8) length++;

  const buf = Buffer.alloc(length);
  for (let i = length - 1; i >= 0; i--) {
    buf[i] = value & 0xff;
    value = Math.floor(value / 256);
  }
  buf[0] |= 1 << (8 - length);

  return buf;
};

const element = (idHex: string, payload: Buffer) =>
  Buffer.concat([hexBuf(idHex), sizeVint(payload.length), payload]);

const uintPayload = (value: number) => {
  let bytes = 1;
  while (value >= 2 ** (8 * bytes)) bytes++;

  const buf = Buffer.alloc(bytes);
  buf.writeUIntBE(value, 0, bytes);

  return buf;
};

const opusHead = (sampleRate: number, channels: number) => {
  const buf = Buffer.alloc(19);
  buf.write('OpusHead', 0, 'ascii');
  buf.writeUInt8(1, 8);
  buf.writeUInt8(channels, 9);
  buf.writeUInt16LE(0, 10);
  buf.writeUInt32LE(sampleRate, 12);
  buf.writeInt16LE(0, 16);
  buf.writeUInt8(0, 18);

  return buf;
};

const buildHeader = (sampleRate: number, channels: number) => {
  const ebml = element(
    '1a45dfa3',
    Buffer.concat([
      element('4286', uintPayload(1)),
      element('42f7', uintPayload(1)),
      element('42f2', uintPayload(4)),
      element('42f3', uintPayload(8)),
      element('4282', Buffer.from('webm', 'ascii')),
      element('4287', uintPayload(2)),
      element('4285', uintPayload(2)),
    ]),
  );

  const info = element(
    '1549a966',
    Buffer.concat([
      element('2ad7b1', uintPayload(1000000)),
      element('4d80', Buffer.from('nori', 'ascii')),
      element('5741', Buffer.from('nori', 'ascii')),
    ]),
  );

  const rate = Buffer.alloc(4);
  rate.writeFloatBE(sampleRate, 0);

  const audio = element(
    'e1',
    Buffer.concat([element('b5', rate), element('9f', uintPayload(channels))]),
  );

  const trackEntry = element(
    'ae',
    Buffer.concat([
      element('d7', uintPayload(1)),
      element('73c5', uintPayload(1)),
      element('83', uintPayload(2)),
      element('86', Buffer.from('A_OPUS', 'ascii')),
      element('63a2', opusHead(sampleRate, channels)),
      audio,
    ]),
  );

  const segmentStart = Buffer.concat([
    Buffer.from('18538067', 'hex'),
    Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
  ]);

  return Buffer.concat([ebml, segmentStart, info, element('1654ae6b', trackEntry)]);
};

const simpleBlock = (packet: Buffer, relTimeMs: number) => {
  const time = Math.max(-32768, Math.min(32767, relTimeMs));
  const head = Buffer.from([0x81, (time >> 8) & 0xff, time & 0xff, 0x80]);

  return element('a3', Buffer.concat([head, packet]));
};

export class WebMOpusMuxer extends Transform {
  private webmHeader: Buffer;
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private blockIndex = 0;
  private clusterStart = 0;
  private headerSent = false;

  constructor(sampleRate = 48000, channels = 2) {
    super({ writableObjectMode: true });
    this.webmHeader = buildHeader(sampleRate, channels);
  }

  private flushCluster() {
    if (this.pending.length === 0) return;

    const timecode = element('e7', uintPayload(this.clusterStart * OPUS_FRAME_MS));
    this.push(element('1f43b675', Buffer.concat([timecode, ...this.pending])));

    this.pending = [];
    this.pendingBytes = 0;
    this.clusterStart = this.blockIndex;
  }

  override _transform(packet: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      if (Buffer.isBuffer(packet) && packet.length > 0) {
        if (!this.headerSent) {
          this.push(this.webmHeader);
          this.headerSent = true;
        }

        const block = simpleBlock(packet, (this.blockIndex - this.clusterStart) * OPUS_FRAME_MS);
        this.pending.push(block);
        this.pendingBytes += block.length;
        this.blockIndex++;

        if (this.pending.length >= BLOCKS_PER_CLUSTER || this.pendingBytes >= CLUSTER_FLUSH_BYTES) {
          this.flushCluster();
        }
      }

      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  override _final(callback: (error?: Error | null) => void) {
    try {
      this.flushCluster();
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}

export const pcmToWebm = (pcm: Readable) => {
  const encoder = new PrismOpusEncoder({ rate: 48000, channels: 2, frameSize: 960 });

  try {
    encoder.setBitrate(128000);
  } catch {}

  const muxer = new WebMOpusMuxer();

  pcm.on('error', (error) => encoder.destroy(error));
  encoder.on('error', (error: Error) => muxer.destroy(error));
  muxer.on('error', () => null);

  muxer.once('close', () => {
    pcm.destroy();
    encoder.destroy();
  });

  pcm.pipe(encoder).pipe(muxer);

  return muxer;
};

const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const isOpusFormat = (format: string) => /webm|opus/i.test(format);

const getTrackstream = async (node: NodeAccess, encoded: string, guildId: string) => {
  const response = await fetch(
    `${node.baseUrl}/v4/trackstream?encodedTrack=${encodeURIComponent(encoded)}`,
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

  try {
    const response = await fetch(
      `${node.baseUrl}/v4/loadtracks?identifier=${encodeURIComponent(uri)}`,
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
    console.log(`[Nori] trackstream format "${direct.format || '?'}" goes through ffmpeg.`);

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

const TRACK_KIND_AUDIO = 1;
const UNPUBLISH_WAIT_TIMEOUT = 1200;

const pendingUnpublish = new WeakMap<object, Map<string, Promise<void>>>();

export const unpublishStaleAudio = (connection: any) => {
  try {
    const room = connection?.room;
    const participant = room?.localParticipant;

    if (!room?.isConnected || typeof participant?.unpublishTrack !== 'function') return;

    const publications = participant.trackPublications;
    if (!publications || typeof publications.entries !== 'function') return;

    let pending = pendingUnpublish.get(participant);
    if (!pending) {
      pending = new Map();
      pendingUnpublish.set(participant, pending);
    }

    for (const [sid, publication] of publications.entries()) {
      if (publication?.kind !== TRACK_KIND_AUDIO || pending.has(sid)) continue;

      const settle: Promise<void> = Promise.resolve(participant.unpublishTrack(sid, true))
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          if (pending!.get(sid) === settle) pending!.delete(sid);
        });

      pending.set(sid, settle);
    }
  } catch {}
};

export const awaitStaleAudio = async (connection: any) => {
  try {
    const participant = connection?.room?.localParticipant;
    if (!participant) return;

    const pending = pendingUnpublish.get(participant);
    if (!pending || pending.size === 0) return;

    await Promise.race([
      Promise.allSettled([...pending.values()]),
      new Promise<void>((resolve) => setTimeout(resolve, UNPUBLISH_WAIT_TIMEOUT).unref?.()),
    ]);
  } catch {}
};

export const prepareVoice = async (connection: any) => {
  unpublishStaleAudio(connection);
  await awaitStaleAudio(connection);
};

export const releaseVoice = (connection: any) => {
  try {
    connection?.stop();
  } catch {}

  unpublishStaleAudio(connection);
};


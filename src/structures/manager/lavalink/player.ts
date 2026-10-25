import {
  releaseVoice,
  type AudioSource,
  prepareVoice,
  openTrackstream,
} from '#nori/structures/manager/audio.js';
import { sendNowPlaying } from '#nori/fluxer/canvas/files/track.js';
import { resolveAudioUrl, stopEncoder } from '#nori/structures/manager/yt-dlp.js';
import { client, voiceManager } from '#base';
import { VoiceChannel } from '@fluxerjs/core';
import { type GuildQueue, type QueueTrack } from './types.js';
import {
  isYoutubeTrack,
  openLoadstream,
  openNodeYoutube,
  openTrackstreamYoutube,
  openTranscode,
  openYtDlp,
} from './sources.js';
import { nodeAccess } from './node.js';
import { clearIdle, notify, scheduleIdle } from './idle.js';
import { applyVolume } from './volume.js';

type PlayResult = 'finished' | 'failed' | 'skipped';

const END_GRACE_MS = 20000;
const TAIL_MS = 1200;
const POLL_MS = 250;
const TRACKSTREAM_COOLDOWN_MS = 300000;
const ANNOUNCE_TIMEOUT_MS = 5000;

let trackstreamSkipUntil = 0;

const playSource = (
  queue: GuildQueue,
  connection: any,
  track: QueueTrack,
  source: AudioSource,
  announce: () => Promise<void>,
) =>
  new Promise<PlayResult>((resolve) => {
    const startedAt = Date.now();
    let begunAt = startedAt;
    let timer: NodeJS.Timeout | null = null;
    let started = false;
    let done = false;

    const finish = (result: PlayResult = 'finished') => {
      if (done) return;
      done = true;

      if (timer) clearTimeout(timer);
      queue.skip = null;
      queue.playhead = null;

      source.close();
      releaseVoice(connection);
      resolve(result);
    };

    const waitRemaining = () => {
      if (done || timer) return;

      const total = source.fedMs ? source.fedMs() - (source.startMs ?? 0) + 800 : track.duration;
      const remaining = total > 0 ? Math.max(0, total - (Date.now() - begunAt)) : 0;

      if (!source.stream) {
        timer = setTimeout(() => finish(), remaining);
        return;
      }

      const limit = Date.now() + remaining + END_GRACE_MS;

      const poll = () => {
        if (done) return;

        const drained = started && !connection.playing;

        if (drained || Date.now() >= limit) {
          console.log(
            `[Nori] playback ${drained ? 'drained' : 'timed out'} after ${Math.round((Date.now() - begunAt) / 1000)}s (expected ${Math.round(total / 1000)}s).`,
          );
          timer = setTimeout(() => finish(), TAIL_MS);
          return;
        }

        timer = setTimeout(poll, POLL_MS);
      };

      poll();
    };

    queue.skip = () => {
      finish('skipped');
    };

    const stream = source.stream;

    if (stream) {
      stream.once('error', (error) => {
        console.error(`[Nori] ${source.label} stream error:`, error.message);
        finish(started ? 'finished' : 'failed');
      });

      stream.once('end', () => {
        console.log(
          `[Nori] stream ended after ${Math.round((Date.now() - startedAt) / 1000)}s of ${Math.round(track.duration / 1000)}s for "${track.title}"`,
        );
        waitRemaining();
      });

    }

    announce()
      .then(() => (done ? undefined : connection.play(source.url ?? stream)))
      .then(() => {
        if (done) return;

        started = true;
        begunAt = Date.now();
        queue.current = track;
        queue.playhead = () =>
          Math.min(
            (source.startMs ?? 0) + (Date.now() - begunAt),
            source.fedMs?.() ?? Number.POSITIVE_INFINITY,
          );

        if (source.url) waitRemaining();
      })
      .catch((error: unknown) => {
        console.error(`[Nori] ${source.label} play failed:`, (error as Error)?.message ?? error);
        finish(started ? 'finished' : 'failed');
      });
  });

const JOIN_RETRY_DELAY_MS = 1000;

const joinVoice = async (guildId: string, channel: VoiceChannel) => {
  try {
    return await voiceManager.join(channel);
  } catch (error) {
    console.error('[Nori] voice join failed, retrying once:', (error as Error)?.message ?? error);

    voiceManager.leave(guildId);
    await new Promise((resolve) => setTimeout(resolve, JOIN_RETRY_DELAY_MS));

    return voiceManager.join(channel);
  }
};

const playTrack = async (queue: GuildQueue, track: QueueTrack, startFrom = 0) => {
  const channel = client.channels.get(queue.voiceChannelId);
  if (!(channel instanceof VoiceChannel)) throw new Error('Voice channel not found.');

  if (!queue.connection) {
    queue.connection = await joinVoice(queue.guildId, channel);
    applyVolume(queue);
  }

  const connection = queue.connection;

  queue.position = startFrom;
  queue.playhead = null;

  let announced: Promise<void> | null = null;

  const announce = () => {
    if (startFrom > 0) return Promise.resolve();

    if (!announced) {
      announced = Promise.race([
        sendNowPlaying({
          guildId: queue.guildId,
          textChannelId: queue.textChannelId,
          track,
          ownerId: queue.ownerId,
          getPosition: () => (queue.current === track ? (queue.playhead?.() ?? queue.position) : null),
        }).then(
          () => undefined,
          () => undefined,
        ),
        new Promise<void>((resolve) => setTimeout(resolve, ANNOUNCE_TIMEOUT_MS)),
      ]);
    }

    return announced;
  };

  let skipped = false;
  const markSkipped = () => {
    skipped = true;
    stopEncoder(queue.guildId);
  };

  queue.skip = markSkipped;

  await prepareVoice(connection);

  const encoded = (track.raw as any).encoded as string | undefined;

  let resumeFrom = startFrom;
  let trackstreamBlocked = !isYoutubeTrack(track);

  const attempts: Array<[string, () => Promise<AudioSource | null>]> = [];

  if (encoded) {
    attempts.push(
      [
        'trackstream',
        async () => {
          if (resumeFrom > 0 || !isYoutubeTrack(track)) return null;

          if (Date.now() < trackstreamSkipUntil) {
            trackstreamBlocked = true;
            console.log('[Nori] trackstream on cooldown, skipping.');
            return null;
          }

          const direct = await openTrackstream(
            nodeAccess(),
            { encoded, uri: track.uri, duration: track.duration },
            queue.guildId,
          );

          if (!direct) {
            return null;
          }

          if (!direct.transcodeUrl) return direct;

          if (/mpegts|\.m3u8/i.test(`${direct.label} ${direct.transcodeUrl}`)) {
            console.log('[Nori] trackstream returned HLS, skipping to next source.');

            return null;
          }

          return openTranscode(queue.guildId, direct.transcodeUrl, track.duration, direct.label);
        },
      ],
      [
        'trackstream-youtube',
        async () => {
          if (isYoutubeTrack(track) && resumeFrom === 0) return null;

          return openTrackstreamYoutube(queue.guildId, track, resumeFrom, () => skipped);
        },
      ],
      [
        'loadstream',
        async () => {
          if (resumeFrom > 0) return null;

          if (trackstreamBlocked && !isYoutubeTrack(track)) {
            console.log('[Nori] trackstream blocked, skipping loadstream.');
            return null;
          }

          return openLoadstream(queue.guildId, track);
        },
      ],
    );
  }

  attempts.push([
    'nodelink-youtube',
    () => openNodeYoutube(queue.guildId, track, resumeFrom, () => skipped),
  ]);

  if (encoded) {
    attempts.push([
      'loadstream-resume',
      async () => (resumeFrom > 0 ? openLoadstream(queue.guildId, track, resumeFrom, true) : null),
    ]);
  }

  attempts.push(['yt-dlp', () => openYtDlp(queue.guildId, track, resumeFrom)]);

  for (const [name, open] of attempts) {
    if (skipped) {
      break;
    }

    queue.skip = markSkipped;

    const source = await open().catch((error: Error) => {
      console.error(`[Nori] ${name} failed:`, error.message);
      return null;
    });

    if (!source) {
      continue;
    }

    if (skipped) {
      source.close();
      break;
    }

    console.log(`[Nori] Playing "${track.title}" via ${source.label}.`);

    if (name === 'loadstream' && source.stream && track.duration > 0) {
      source.stream.once('end', () => {
        if ((source.fedMs?.() ?? 0) < track.duration * 0.97) {
          void resolveAudioUrl(track.info).catch(() => null);
        }
      });
    }

    const result = await playSource(queue, connection, track, source, announce);

    if (result === 'failed' && name === 'trackstream') {
      trackstreamBlocked = true;
      trackstreamSkipUntil = Date.now() + TRACKSTREAM_COOLDOWN_MS;
    }

    if (result === 'skipped') {
      return;
    }

    if (result === 'finished') {
      const fed = source.fedMs?.() ?? 0;
      const cutShort = track.duration > 0 && fed > 0 && fed < track.duration * 0.97;

      if (!cutShort) {
        return;
      }

      resumeFrom = fed;
      console.warn(`[Nori] "${track.title}" cut short at ${fed}ms of ${track.duration}ms, falling back.`);
    }
  }

  queue.skip = null;

  if (resumeFrom > 0 && !skipped) {
    return;
  }

  if (!skipped) {
    throw new Error('Audio source not found.');
  }

};

export const run = async (queue: GuildQueue) => {
  if (queue.busy) {
    return;
  }

  queue.busy = true;
  clearIdle(queue);

  while (true) {
    while (queue.tracks.length > 0) {
      const track = queue.tracks.shift()!;
      let from = 0;

      while (true) {
        try {
          await playTrack(queue, track, from);
        } catch (error) {
          console.error(`[Nori] playTrack failed for "${track.title}":`, (error as Error)?.message ?? error);
          await notify(queue.textChannelId, `Não consegui tocar **${track.title}**.`);
          break;
        }

        if (!queue.resumeSignal) break;

        const replay = await queue.resumeSignal;
        queue.resumeSignal = null;

        if (!replay) break;

        from = queue.position;
      }
    }

    queue.current = null;

    if (queue.tracks.length === 0) break;
  }

  queue.busy = false;

  scheduleIdle(queue);
};

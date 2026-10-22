import { EmbedBuilder } from '@fluxerjs/core';
import axios from 'axios';
import { createCommand } from '#base';
import config from '#nori/config/default.config.js';
import { Category, setDescription } from '#nori/lib/category.js';
import {
  enqueue,
  isLavalinkReady,
  searchTrack,
  toQueueTrack,
} from '#nori/structures/manager/lavalink.js';

const SPOTIFY_URL = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album)\/[A-Za-z0-9]+/i;

async function fetchSpotifyCover(url: string): Promise<string | null> {
  const oembed = await axios
    .get<{ thumbnail_url?: string }>('https://open.spotify.com/oembed', {
      params: { url },
      timeout: 5000,
    })
    .then((res) => res.data)
    .catch(() => null);

  if (oembed?.thumbnail_url) return oembed.thumbnail_url;

  const html = await axios
    .get<string>(url.split('?')[0], {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      responseType: 'text',
      timeout: 5000,
    })
    .then((res) => res.data)
    .catch(() => '');

  return /property="og:image" content="([^"]+)"/.exec(html)?.[1] ?? null;
}

createCommand({
  name: 'play',
  nameLocalizations: {
    'pt-BR': 'tocar',
    'es-ES': 'reproducir',
  },
  category: Category.Music,
  ...setDescription.Music({
    'en-US': 'Play a song or playlist, or add it to the queue',
    'pt-BR': 'Toca uma música ou playlist, ou adiciona à fila',
    'es-ES': 'Reproduce una canción o playlist, o la agrega a la cola',
  }),
  aliases: ['p'],
  async run(ctx) {
    const m = ctx.t.commands.music.play;

    const respond = (embed: EmbedBuilder) => ctx.reply({ embeds: [embed] });

    const simple = (description: string) =>
      new EmbedBuilder().setColor(config.color).setDescription(description);

    const query = ctx.args.join(' ').trim();

    if (!query) {
      await respond(simple(m.usage(ctx.prefix)));
      return;
    }

    const voiceChannelId = ctx.voiceManager.getVoiceChannelId(ctx.guildId, ctx.user.id);

    if (!voiceChannelId) {
      await respond(simple(m.notInVoice));
      return;
    }

    if (!isLavalinkReady()) {
      await respond(simple(m.playerStarting));
      return;
    }

    const requester = { id: ctx.user.id, username: ctx.user.username };

    const result = await searchTrack({
      guildId: ctx.guildId,
      voiceChannelId,
      textChannelId: ctx.channelId,
      query,
      requester,
    }).catch(() => null);

    if (!result || result.tracks.length === 0) {
      await respond(simple(m.notFound));
      return;
    }

    const tracks = result.tracks.map((track) => toQueueTrack(track, requester));

    enqueue({
      guildId: ctx.guildId,
      voiceChannelId,
      textChannelId: ctx.channelId,
      tracks,
    });

    if (result.playlist) {
      const embed = simple(m.queuedPlaylist(result.playlist, tracks.length));

      let artwork: string | null = null;

      if (SPOTIFY_URL.test(query)) {
        artwork = await fetchSpotifyCover(query);
      }

      artwork ??= result.artworkUrl ?? tracks[0].artworkUrl ?? null;
      if (artwork) embed.setThumbnail(artwork);

      await respond(embed);
      return;
    }

    const track = tracks[0];
    const title = track.uri ? `[${track.title}](${track.uri})` : track.title;
    const embed = simple(m.queued(title));

    if (track.artworkUrl) embed.setThumbnail(track.artworkUrl);

    await respond(embed);
  },
});

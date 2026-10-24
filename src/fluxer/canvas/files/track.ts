import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { resolve } from 'node:path';
import { EmbedBuilder } from '@fluxerjs/core';
import { client } from '#base';
import config from '#nori/config/default.config.js';
import { getLanguage } from '#nori/i18n/index.js';
import { getGuildMusic } from '#nori/lib/music.js';
import type { QueueTrack } from '#nori/structures/manager/lavalink.js';

const fontsDir = './src/fluxer/canvas/fonts/';

try {
  GlobalFonts.registerFromPath(resolve(fontsDir, 'Nunito-Regular.ttf'), 'N');
  GlobalFonts.registerFromPath(resolve(fontsDir, 'Quicksand-Regular.ttf'), 'Q');
} catch {}

const TimeFormat = {
  toDotted(ms: number): string {
    const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ss = String(s).padStart(2, '0');
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
    return `${m}:${ss}`;
  },
};

export async function trackCanva(
  imageUri: string,
  title: string,
  author: string,
  dn: number,
  dk: number,
) {
  const img = await loadImage(imageUri);
  const w = 1920;
  const h = 1080;
  const cv = createCanvas(w, h);
  const x = cv.getContext('2d');
  const s = createCanvas(5, 1);
  const sx = s.getContext('2d');

  sx.drawImage(img, 0, 0, 5, 1);
  const dta = sx.getImageData(0, 0, 5, 1).data;
  const f = (i: number) => `rgba(${dta[i]},${dta[i + 1]},${dta[i + 2]},`;

  x.fillStyle = '#080808';
  x.fillRect(0, 0, w, h);

  const r = (a: number, b: number, z: number, k: string) => {
    const g = x.createRadialGradient(a, b, 0, a, b, z);
    g.addColorStop(0, k + '0.95)');
    g.addColorStop(0.6, k + '0.2)');
    g.addColorStop(1, k + '0)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  };

  r(576, 216, 800, f(0));
  r(1344, 432, 750, f(4));
  r(960, 972, 850, f(8));
  r(1728, 108, 700, f(12));
  r(300, 800, 650, f(16));

  x.filter = 'blur(90px) saturate(1.6) brightness(0.6)';
  x.drawImage(cv, 0, 0);
  x.filter = 'none';

  x.fillStyle = 'rgba(0,0,0,0.4)';
  x.fillRect(0, 0, w, h);

  x.save();
  x.beginPath();
  x.roundRect(717, 162, 486, 486, 43);
  x.clip();
  x.drawImage(img, 717, 162, 486, 486);
  x.restore();

  x.textAlign = 'center';
  x.fillStyle = '#fff';
  x.font = 'bold 59px N';
  x.shadowColor = '#000b';
  x.shadowBlur = 20;
  x.fillText(title.length > 40 ? title.substring(0, 37) + '...' : title, 960, 783);
  x.fillStyle = '#fff9';
  x.font = '40px Q';
  x.fillText(author.length > 50 ? author.substring(0, 47) + '...' : author, 960, 858);

  x.shadowBlur = 0;
  const barW = 1704;
  const progress = Math.min(Math.max(dn / dk, 0), 1) || 0;

  x.fillStyle = '#fff2';
  x.fillRect(108, 945, barW, 10);
  x.fillStyle = '#fffb';
  x.fillRect(108, 945, barW * progress, 10);

  x.fillStyle = '#fff6';
  x.font = '30px Q';
  x.textAlign = 'left';
  x.fillText(TimeFormat.toDotted(dn), 108, 1005);
  x.textAlign = 'right';
  x.fillText(TimeFormat.toDotted(dk), 1812, 1005);

  return cv.toBuffer('image/png');
}

type NowPlayingOptions = {
  guildId: string;
  textChannelId: string;
  track: QueueTrack;
  ownerId?: string;
};

const messages = new Map<string, { delete(): Promise<unknown> }>();

export async function deleteNowPlaying(guildId: string) {
  const message = messages.get(guildId);
  messages.delete(guildId);
  if (message) await message.delete().catch(() => null);
}

const trackEmbed = async (track: QueueTrack, ownerId?: string) => {
  const language = await getLanguage(ownerId ?? track.requester.id);
  const p = language.general.music.player;
  const clean = track.title.replace(/[[\]]/g, '');
  const title = track.uri ? `[${clean}](${track.uri})` : `**${clean}**`;

  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setAuthor({ name: p.nowPlaying })
    .setDescription(`${title}\n${track.author} • ${TimeFormat.toDotted(track.duration)}`)
    .setFooter({ text: p.requestedBy(track.requester.username) });

  if (track.artworkUrl) embed.setThumbnail(track.artworkUrl);

  return embed;
};

export async function sendNowPlaying({ guildId, textChannelId, track, ownerId }: NowPlayingOptions) {
  await deleteNowPlaying(guildId);

  const { effective } = await getGuildMusic(guildId);

  let message: unknown = null;

  if (effective === 'canvas' && track.artworkUrl) {
    const image = await trackCanva(track.artworkUrl, track.title, track.author, 0, track.duration);

    message = await client.channels
      .send(textChannelId, { files: [{ name: 'track.png', data: image }] })
      .catch(() => null);
  } else {
    message = await client.channels
      .send(textChannelId, { embeds: [await trackEmbed(track, ownerId)] })
      .catch(() => null);
  }

  if (message) messages.set(guildId, message as { delete(): Promise<unknown> });
}

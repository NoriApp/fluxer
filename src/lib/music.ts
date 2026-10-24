import { db } from '#nori/db/index.js';
import { MUSIC_STYLES, type MusicStyle } from '#nori/db/schemas/guild.js';

type GuildMusic = {
  premium: boolean;
  style: MusicStyle;
  effective: MusicStyle;
};

export const getGuildMusic = async (guildId: string): Promise<GuildMusic> => {
  try {
    const doc = (await db.guild.findOne({ guildId }).select('premium music').lean()) as {
      premium?: boolean;
      music?: { style?: string };
    } | null;

    const premium = doc?.premium === true;
    const style = MUSIC_STYLES.find((item) => item === doc?.music?.style) ?? 'embed';

    return { premium, style, effective: premium ? style : 'embed' };
  } catch {
    return { premium: false, style: 'embed', effective: 'embed' };
  }
};

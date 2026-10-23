import { db } from '#nori/db/index.js';

const freshGuilds = new Set<string>();

export const markFreshGuild = (guildId: string) => {
  freshGuilds.add(guildId);
};

export const isFreshGuild = (guildId: string) => freshGuilds.has(guildId);

export const claimMessage = async (guildId: string, messageId: string) => {
  try {
    await db.guild.updateOne(
      { guildId, messages: { $ne: messageId } },
      { $push: { messages: { $each: [messageId], $slice: -50 } } },
      { upsert: true },
    );

    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    return true;
  }
};

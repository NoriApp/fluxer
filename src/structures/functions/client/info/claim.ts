import { db } from '#nori/db/index.js';

export const claimMessage = async (messageId: string) => {
  try {
    await db.messageClaim.create({ _id: messageId });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    return true;
  }
};

import type { Message } from '@fluxerjs/core';
import { db } from '#nori/db/index.js';
import { handleTermsReply, runTerms } from '#nori/fluxer/menu/common/etc/terms.js';

export { handleTermsReply };

const accepted = new Set<string>();
const pending = new Set<string>();

const hasAccepted = async (userId: string) => {
  if (accepted.has(userId)) return true;

  const found = await db.user.exists({ userId, language: { $ne: null } });
  if (!found) return false;

  accepted.add(userId);

  return true;
};

export const forgetTerms = (userId: string) => accepted.delete(userId);

export const initTerms = async (message: Message) => {
  const userId = message.author.id;

  if (await hasAccepted(userId)) return true;
  if (pending.has(userId)) return false;

  pending.add(userId);

  try {
    const result = await runTerms(message);

    if (result === 'accepted') accepted.add(userId);

    return result === 'accepted';
  } finally {
    pending.delete(userId);
  }
};

export default initTerms;

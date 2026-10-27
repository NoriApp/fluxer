import User from '#nori/db/schemas/user.js';

export type BlacklistData = {
  active?: boolean;
  reason?: string | null;
  category?: string | null;
  expiresAt?: Date | null;
};

export type BlacklistEntry = {
  userId: string;
  reason: string | null;
  authorId: string | null;
  category: string | null;
  expiresAt: Date | null;
  createdAt: Date;
};

const cache = new Map<string, BlacklistEntry>();

let loading: Promise<void> | null = null;

const UNITS = [
  ['d', 86400],
  ['h', 3600],
  ['m', 60],
  ['s', 1],
] as const;

const toEntry = (doc: any): BlacklistEntry => ({
  userId: doc.userId,
  reason: doc.blacklist?.reason ?? null,
  authorId: doc.blacklist?.authorId ?? null,
  category: doc.blacklist?.category ?? null,
  expiresAt: doc.blacklist?.expiresAt ?? null,
  createdAt: doc.blacklist?.createdAt ?? new Date(),
});

const isExpired = (entry: { expiresAt: Date | null }) => !!entry.expiresAt && entry.expiresAt.getTime() <= Date.now();

const ensureLoaded = () => {
  loading ??= User.find({ 'blacklist.active': true })
    .lean()
    .then((docs: any[]) => {
      cache.clear();

      for (const doc of docs) {
        const entry = toEntry(doc);
        cache.set(entry.userId, entry);
      }
    })
    .catch((error: unknown) => {
      loading = null;
      console.error('[Nori] Failed to load blacklist:', error);
    });

  return loading;
};

export const blocksCommand = (data: BlacklistData | null | undefined, category: unknown) => {
  if (!data?.active || isExpired({ expiresAt: data.expiresAt ?? null })) return false;

  return !data.category || data.category === String(category);
};

export const formatRemaining = (expiresAt: Date | null) => {
  if (!expiresAt) return null;

  let seconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
  const parts: string[] = [];

  for (const [unit, size] of UNITS) {
    const value = Math.floor(seconds / size);

    if (value > 0) {
      parts.push(`${value}${unit}`);
      seconds -= value * size;
    }
  }

  return parts.slice(0, 2).join(' ');
};

export const getBlacklisted = async (userId: string) => {
  await ensureLoaded();

  const entry = cache.get(userId);

  return entry && !isExpired(entry) ? entry : null;
};

export const listBlacklist = async () => {
  await ensureLoaded();

  return [...cache.values()].filter((entry) => !isExpired(entry)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const addBlacklist = async (
  userId: string,
  reason: string | null,
  authorId: string,
  category: string | null,
  expiresAt: Date | null,
) => {
  await ensureLoaded();

  const existing = cache.get(userId);
  const createdAt = new Date();

  const saved = await User.updateOne(
    { userId },
    { $set: { blacklist: { active: true, reason, authorId, category, expiresAt, createdAt } } },
    { upsert: true },
  )
    .then(() => true)
    .catch(() => false);

  if (!saved) return 'failed' as const;

  cache.set(userId, { userId, reason, authorId, category, expiresAt, createdAt });

  return existing && !isExpired(existing) ? ('updated' as const) : ('added' as const);
};

export const removeBlacklist = async (userId: string) => {
  await ensureLoaded();

  if (!cache.has(userId)) return 'notFound' as const;

  const saved = await User.updateOne(
    { userId },
    { $set: { blacklist: { active: false, reason: null, authorId: null, category: null, expiresAt: null, createdAt: null } } },
  )
    .then(() => true)
    .catch(() => false);

  if (!saved) return 'failed' as const;

  cache.delete(userId);
  return 'removed' as const;
};

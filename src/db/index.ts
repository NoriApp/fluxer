import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env } from '#nori/env.js';
import type { Guild } from '#nori/db/schemas/guild.js';
import type { User } from '#nori/db/schemas/user.js';

const SCHEMAS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schemas');

mongoose.set('strictQuery', true);

mongoose.connection.on('connected', () => {
  logger.info('[Nori] MongoDB connected.');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('[Nori] MongoDB disconnected.');
});

mongoose.connection.on('error', (error) => {
  logger.error('[Nori] MongoDB error:', error.message);
});

const walk = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) return walk(fullPath);
      if (/\.(ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) return [fullPath];

      return [];
    }),
  );

  return files.flat().sort();
};

const loadSchemas = async () => {
  let files: string[] = [];

  try {
    files = await walk(SCHEMAS_DIR);
  } catch (error) {
    logger.error('[Nori] Failed to read schemas directory:', (error as Error)?.message ?? error);
    return;
  }

  for (const file of files) {
    try {
      await import(pathToFileURL(file).href);
    } catch (error) {
      logger.error(`[Nori] Failed to load schema ${path.basename(file)}:`, error);
    }
  }
};

const initModels = async () => {
  const models = Object.values(mongoose.models);

  const results = await Promise.allSettled(models.map((model) => model.init()));

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error(`[Nori] Failed to init model ${models[index].modelName}:`, result.reason?.message ?? result.reason);
    }
  });
};

export const connectDatabase = async () => {
  if (mongoose.connection.readyState === 1) return mongoose;

  await loadSchemas();

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  });

  await initModels();

  return mongoose;
};

export const disconnectDatabase = async () => {
  if (mongoose.connection.readyState === 0) return;

  await mongoose.disconnect();
};

connectDatabase().catch((error) => {
  logger.error('[Nori] MongoDB failed to connect:', error?.message ?? error);
  process.exit(1);
});

type Models = {
  guild: typeof Guild;
  user: typeof User;
};

export const db = new Proxy({} as Models, {
  get: (_target, key) => {
    const name = String(key);
    return mongoose.models[name.charAt(0).toUpperCase() + name.slice(1)];
  },
});

export { mongoose };
export default mongoose;

import { type GuildQueue } from './types.js';

export const state = { ready: false };

export const queues = new Map<string, GuildQueue>();

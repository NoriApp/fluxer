import { LavalinkManager } from 'lavalink-client';
import { type GuildQueue } from './types.js';

export const state: { manager: LavalinkManager | null } = { manager: null };

export const queues = new Map<string, GuildQueue>();

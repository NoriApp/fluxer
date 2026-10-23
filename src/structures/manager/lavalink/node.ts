import { LavalinkManager } from 'lavalink-client';
import config from '#nori/config/default.config.js';
import { type NodeAccess } from '#nori/structures/manager/audio.js';
import { state } from './state.js';

export const initLavalink = async (user: { id: string; username: string }) => {

  state.manager = new LavalinkManager({
    nodes: config.nodes.map((node) => ({ ...node })),
    sendToShard: () => {},
    autoSkip: false,
    client: { id: user.id, username: user.username },
  });

  state.manager.nodeManager.on('connect', (node) => {
    console.log(`[Nori] Node ${node.id} connected.`);
  });

  state.manager.nodeManager.on('error', (node, error) => {
    console.error(`[Nori] Node ${node.id} error:`, error.message);
  });

  await state.manager.init({ id: user.id, username: user.username });

  return state.manager;
};

export const isLavalinkReady = () => state.manager !== null;

export const nodeAccess = (): NodeAccess => {
  const node = config.nodes[0];
  const protocol = node.secure ? 'https' : 'http';
  const sessionId = (state.manager?.nodeManager.nodes.get(node.id) as any)?.sessionId as string | undefined;

  const access: NodeAccess = {
    baseUrl: `${protocol}://${node.host}:${node.port}`,
    headers: {
      Authorization: node.authorization,
      'Client-Name': 'Nori/1.0.0',
      ...(sessionId ? { 'Session-Id': sessionId } : {}),
    },
  };

  return access;
};

export type NodeStatus = {
  id: string;
  online: boolean;
  latency: number | null;
  players: number;
  playingPlayers: number;
  uptime: number;
  cpuLoad: number;
  memoryUsed: number;
  memoryAllocated: number;
};

type NodeConfig = (typeof config.nodes)[number];

const fetchNodeStatus = async (node: NodeConfig): Promise<NodeStatus> => {
  const protocol = node.secure ? 'https' : 'http';
  const started = Date.now();

  const offline: NodeStatus = {
    id: node.id,
    online: false,
    latency: null,
    players: 0,
    playingPlayers: 0,
    uptime: 0,
    cpuLoad: 0,
    memoryUsed: 0,
    memoryAllocated: 0,
  };

  try {
    const response = await fetch(`${protocol}://${node.host}:${node.port}/v4/stats`, {
      headers: {
        Authorization: node.authorization,
        'Client-Name': 'Nori/1.0.0',
      },
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - started;

    if (!response.ok) return { ...offline, latency };

    const data = (await response.json()) as any;

    return {
      id: node.id,
      online: true,
      latency,
      players: Number(data.players ?? 0),
      playingPlayers: Number(data.playingPlayers ?? 0),
      uptime: Number(data.uptime ?? 0),
      cpuLoad: Number(data.cpu?.nodelinkLoad ?? data.cpu?.lavalinkLoad ?? 0),
      memoryUsed: Number(data.memory?.used ?? 0),
      memoryAllocated: Number(data.memory?.allocated ?? 0),
    };
  } catch (error) {
    return offline;
  }
};

export const getNodeStatus = () => fetchNodeStatus(config.nodes[0]);

export const getAllNodeStatus = () => Promise.all(config.nodes.map((node) => fetchNodeStatus(node)));

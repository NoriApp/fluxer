import { Readable } from 'node:stream';

export type NodeAccess = {
  baseUrl: string;
  headers: Record<string, string>;
};

export type AudioSource = {
  label: string;
  url?: string;
  transcodeUrl?: string;
  stream?: Readable;
  fedMs?: () => number;
  startMs?: number;
  close: () => void;
};

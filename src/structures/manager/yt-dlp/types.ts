import { PassThrough } from 'node:stream';

export type TrackInfo = {
  title?: string;
  author?: string;
  duration?: number;
  uri?: string;
};

export type PcmSource = {
  stream: PassThrough;
  fedMs: () => number;
};

export type Candidate = {
  url: string;
  title: string;
  uploader: string;
  duration: number;
};

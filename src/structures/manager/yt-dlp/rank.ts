import { type Candidate, type TrackInfo } from './types.js';

const UNWANTED = [
  'live',
  'cover',
  'remix',
  'karaoke',
  'instrumental',
  'slowed',
  'reverb',
  'sped',
  'nightcore',
  '8d',
  'mashup',
];

export const normalize = (value: string, strip = false) =>
  (strip ? value.replace(/\(.*?\)|\[.*?\]/g, ' ') : value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokenize = (value: string, strip = false) =>
  new Set(
    normalize(value, strip)
      .split(' ')
      .filter((token) => token.length > 1),
  );

const overlap = (needle: Set<string>, haystack: Set<string>) => {
  if (!needle.size) return 0;

  let hits = 0;
  for (const token of needle) if (haystack.has(token)) hits++;

  return hits / needle.size;
};

export const rankCandidates = <T extends Candidate>(candidates: T[], info: TrackInfo, limit: number): T[] => {
  const titleTokens = tokenize(info.title ?? '', true);
  const authorTokens = tokenize(info.author ?? '', true);
  const originalTokens = tokenize(info.title ?? '');
  const targetSeconds = info.duration ? info.duration / 1000 : 0;

  return candidates
    .filter(
      (candidate) =>
        !(targetSeconds && candidate.duration && candidate.duration < targetSeconds * 0.7),
    )
    .map((candidate) => {
      const candidateTokens = tokenize(candidate.title);
      const haystack = tokenize(`${candidate.title} ${candidate.uploader}`);

      let score = overlap(titleTokens, haystack) * 3 + overlap(authorTokens, haystack) * 2;

      for (const word of UNWANTED) {
        if (candidateTokens.has(word) && !originalTokens.has(word)) score -= 2;
      }

      if (tokenize(candidate.uploader).has('topic')) score += 1.5;

      if (targetSeconds && candidate.duration) {
        const diff = Math.abs(candidate.duration - targetSeconds);
        if (diff <= 4) score += 3;
        else if (diff <= 12) score += 1;
        else if (diff > 30) score -= 4;
      }

      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.candidate);
};

import mongoose, { type InferSchemaType } from 'mongoose';
import config from '#nori/config/default.config.js';

export const MUSIC_STYLES = ['embed', 'canvas'] as const;

export type MusicStyle = (typeof MUSIC_STYLES)[number];

const guildSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    prefix: { type: String, default: config.prefix, trim: true, maxlength: 5 },
    premium: { type: Boolean, default: false },
    music: {
      style: { type: String, enum: [...MUSIC_STYLES], default: 'embed' },
    },
    messages: { type: [String], default: [], select: false },
  },
  { timestamps: true },
);

export type GuildDocument = InferSchemaType<typeof guildSchema>;

export const Guild = mongoose.models.Guild ?? mongoose.model('Guild', guildSchema);

export default Guild;

import mongoose, { type InferSchemaType } from 'mongoose';
import config from '#nori/config/default.config.js';

const guildSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    prefix: { type: String, default: config.prefix, trim: true, maxlength: 5 },
    messages: { type: [String], default: [], select: false },
  },
  { timestamps: true },
);

export type GuildDocument = InferSchemaType<typeof guildSchema>;

export const Guild = mongoose.models.Guild ?? mongoose.model('Guild', guildSchema);

export default Guild;
